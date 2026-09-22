'use server';

import { env } from 'cloudflare:workers';
import { studentAttemptAllowed,validRedemption } from './request-security';
import { findPilotStudent } from './student-number';
import { redemptionFailure, diagnoseRedemptionFailure } from './redemption-errors';
import { eligiblePointAward, claimPointAward, validateAwardInput, type EligiblePointAward, type AwardExpiryMode } from './point-award-policy';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getChatGPTUser } from './chatgpt-auth';
import { digestToken, ensureTeacher, id, initials, now } from './data';
import { rosterCourseCode, validateRoster, type RosterStudent } from './roster-import';
import { ANIMAL_NICKNAMES } from './animal-nicknames';
import { getPilotTeacherDirectory } from './pilot-auth';
import { loadCourseRecords } from './course-records';
import { validateTimetable, type TimetableRow, type ScheduledClass } from './timetable';
import { validateAttendanceImport, type AttendanceImportRow } from './attendance-import';

async function timetableContext(courseId:string,read=false){
 const user=await getChatGPTUser();
 if(!user||!(await (read?canView:canEdit)(courseId,user.userId)))throw Error('You cannot manage this course.');
 const course=await env.DB.prepare('SELECT id,code FROM courses WHERE id=? AND archived_at IS NULL').bind(courseId).first<{id:string;code:string}>();
 if(!course)throw Error('Course unavailable.');
 return {user,course,db:env.DB};
}

export async function getScheduledClasses(courseId:string):Promise<ScheduledClass[]>{
 const {db}=await timetableContext(courseId,true);
 const result=await db.prepare(`SELECT sc.id,c.code AS courseId,sc.class_id AS classId,sc.class_date AS date,sc.week,sc.class_time AS time,sc.room,sc.teacher,sc.comments,sc.session_id AS sessionId,cs.closed_at AS closedAt FROM scheduled_classes sc JOIN courses c ON c.id=sc.course_id LEFT JOIN class_sessions cs ON cs.id=sc.session_id WHERE sc.course_id=? ORDER BY sc.class_date,sc.class_time,sc.class_id`).bind(courseId).all<ScheduledClass>();
 return result.results;
}

export async function importTimetable(courseId:string,input:TimetableRow[]){
 const {user,course,db}=await timetableContext(courseId),rows=validateTimetable(input,course.code),time=now();
 const statements=rows.map(row=>db.prepare(`INSERT INTO scheduled_classes (id,course_id,class_id,class_date,week,class_time,room,teacher,comments,imported_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id,class_id) DO NOTHING`).bind(id(),courseId,row.classId,row.date,row.week,row.time,row.room,row.teacher,row.comments,user.userId,time));
 statements.push(db.prepare('INSERT INTO audit_log (id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id(),courseId,user.userId,'timetable.imported','course',courseId,JSON.stringify({submitted:rows.length}),time));
 const result=await db.batch(statements),created=result.slice(0,-1).reduce((sum,r)=>sum+r.meta.changes,0);
 revalidatePath('/');return {created,skipped:rows.length-created};
}

export async function startScheduledClass(courseId:string,scheduledId:string,minutes:number){
 const {user,db}=await timetableContext(courseId);
 if(!Number.isInteger(minutes)||minutes<5||minutes>240)throw Error('Choose an attendance window from 5 to 240 minutes.');
 const scheduled=await db.prepare('SELECT class_id AS classId,room FROM scheduled_classes WHERE id=? AND course_id=? AND session_id IS NULL').bind(scheduledId,courseId).first<{classId:string;room:string}>();
 if(!scheduled)throw Error('This class has already been started or is unavailable.');
 const sessionId=id(),token=crypto.randomUUID()+crypto.randomUUID(),digest=await digestToken(token),time=now(),expiresAt=time+minutes*60;
 const result=await db.batch([
  db.prepare(`INSERT INTO class_sessions (id,course_id,title,room,attendance_token_digest,attendance_expires_at,attendance_duration_minutes,opened_by,opened_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM scheduled_classes WHERE id=? AND course_id=? AND session_id IS NULL) AND NOT EXISTS (SELECT 1 FROM class_sessions WHERE course_id=? AND closed_at IS NULL)`).bind(sessionId,courseId,scheduled.classId,scheduled.room,digest,expiresAt,minutes,user.userId,time,scheduledId,courseId,courseId),
  db.prepare('UPDATE scheduled_classes SET session_id=? WHERE id=? AND course_id=? AND session_id IS NULL AND EXISTS (SELECT 1 FROM class_sessions WHERE id=?)').bind(sessionId,scheduledId,courseId,sessionId),
  db.prepare(`INSERT INTO audit_log (id,course_id,actor_id,action,entity_type,entity_id,details,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM class_sessions WHERE id=?)`).bind(id(),courseId,user.userId,'session.opened','class_session',sessionId,JSON.stringify({scheduledId,classId:scheduled.classId}),time,sessionId)
 ]);
 if(!result[0].meta.changes)throw Error('Close the active session before starting another class.');
 revalidatePath('/');return {urlPath:`/redeem/attendance/${token}`,expiresAt};
}

export async function resetScheduledClass(courseId:string,scheduledId:string){
 const {user,db}=await timetableContext(courseId),time=now();
 const scheduled=await db.prepare(`SELECT sc.session_id AS sessionId FROM scheduled_classes sc JOIN class_sessions cs ON cs.id=sc.session_id WHERE sc.id=? AND sc.course_id=? AND cs.closed_at IS NOT NULL`).bind(scheduledId,courseId).first<{sessionId:string}>();
 if(!scheduled)throw Error('Only a completed class can be reset to scheduled.');
 const write=db.prepare(`UPDATE scheduled_classes SET session_id=NULL WHERE id=? AND course_id=? AND session_id=? AND EXISTS (SELECT 1 FROM class_sessions WHERE id=? AND closed_at IS NOT NULL)`).bind(scheduledId,courseId,scheduled.sessionId,scheduled.sessionId);
 const changes=await auditedWrite(db,write,courseId,user.userId,'scheduled_class.reset','scheduled_class',scheduledId,{previousSessionId:scheduled.sessionId},time);
 if(!changes)throw Error('This class changed before it could be reset. Refresh and try again.');
 revalidatePath('/');
}

export async function importClassAttendance(courseId:string,scheduledId:string,input:AttendanceImportRow[],requestId:string){
 const {user,course,db}=await timetableContext(courseId);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId??''))throw Error('Refresh the upload and try again.');
 const previous=await db.prepare(`SELECT details FROM audit_log WHERE id=? AND course_id=? AND actor_id=? AND action='attendance.imported_csv'`).bind(requestId,courseId,user.userId).first<{details:string}>();
 if(previous)return JSON.parse(previous.details) as {imported:number;skipped:number;classId:string;sessionCreated:boolean};
 const scheduled=await db.prepare(`SELECT sc.id,sc.class_id AS classId,sc.class_date AS classDate,sc.class_time AS classTime,sc.room,sc.session_id AS sessionId,cs.opened_at AS openedAt FROM scheduled_classes sc LEFT JOIN class_sessions cs ON cs.id=sc.session_id WHERE sc.id=? AND sc.course_id=?`).bind(scheduledId,courseId).first<{id:string;classId:string;classDate:string;classTime:string;room:string|null;sessionId:string|null;openedAt:number|null}>();
 if(!scheduled)throw Error('This semester class is unavailable.');
 const rows=validateAttendanceImport(input,scheduled.classId),numbers=rows.map(row=>row.studentNumber),placeholders=numbers.map(()=>'?').join(',');
 const students=await db.prepare(`SELECT s.id,s.student_number AS studentNumber FROM students s JOIN enrolments e ON e.student_id=s.id WHERE e.course_id=? AND e.active=1 AND lower(trim(s.student_number)) IN (${placeholders})`).bind(courseId,...numbers).all<{id:string;studentNumber:string}>();
 const found=new Map(students.results.map(student=>[student.studentNumber.trim().toLowerCase(),student]));
 const missing=numbers.filter(number=>!found.has(number));
 if(missing.length)throw Error(`Not enrolled in ${course.code}: ${missing.slice(0,8).join(', ')}${missing.length>8?` and ${missing.length-8} more`:''}. Update the roster or correct the CSV.`);
 const time=now(),sessionCreated=!scheduled.sessionId,sessionId=scheduled.sessionId??id(),sessionTime=scheduled.openedAt??lisbonEpoch(scheduled.classDate,scheduled.classTime),existing=await db.prepare(`SELECT s.student_number AS studentNumber,a.voided_at AS voidedAt FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.session_id=? AND lower(trim(s.student_number)) IN (${placeholders})`).bind(sessionId,...numbers).all<{studentNumber:string;voidedAt:number|null}>(),already=new Map(existing.results.map(row=>[row.studentNumber.trim().toLowerCase(),row.voidedAt]));
 const imported=numbers.filter(number=>!already.has(number)||already.get(number)!==null).length,skipped=numbers.length-imported,details={imported,skipped,classId:scheduled.classId,sessionCreated};
 const statements:ReturnType<typeof db.prepare>[]=[];
 if(sessionCreated){
  const token=await digestToken(`csv:${crypto.randomUUID()}:${sessionId}`),recordedAt=sessionTime;
  statements.push(db.prepare(`INSERT INTO class_sessions(id,course_id,title,room,attendance_token_digest,attendance_expires_at,attendance_duration_minutes,opened_by,opened_at,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(sessionId,courseId,scheduled.classId,scheduled.room,token,recordedAt,30,user.userId,recordedAt,time));
  statements.push(db.prepare(`UPDATE scheduled_classes SET session_id=? WHERE id=? AND course_id=? AND session_id IS NULL`).bind(sessionId,scheduledId,courseId));
 }
 const recordedAt=sessionTime;
 for(const number of numbers){const student=found.get(number)!;statements.push(db.prepare(`INSERT INTO attendance(id,session_id,student_id,recorded_by,source,identity_verification,recorded_at) VALUES (?,?,?,?,'teacher_csv','teacher_confirmed',?) ON CONFLICT(session_id,student_id) DO UPDATE SET recorded_by=excluded.recorded_by,source=excluded.source,identity_verification=excluded.identity_verification,recorded_at=excluded.recorded_at,voided_at=NULL,voided_by=NULL,void_reason=NULL WHERE attendance.voided_at IS NOT NULL`).bind(id(),sessionId,student.id,user.userId,recordedAt));}
 statements.push(db.prepare(`INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(requestId,courseId,user.userId,'attendance.imported_csv','scheduled_class',scheduledId,JSON.stringify(details),time));
 try{await db.batch(statements)}catch(error){const saved=await db.prepare(`SELECT details FROM audit_log WHERE id=? AND course_id=? AND actor_id=? AND action='attendance.imported_csv'`).bind(requestId,courseId,user.userId).first<{details:string}>();if(saved)return JSON.parse(saved.details) as typeof details;throw error;}
 revalidatePath('/');return details;
}

function lisbonEpoch(date:string,time:string){
 const match=`${date} ${time}`.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);if(!match)return now();
 const values=match.slice(1).map(Number),guess=Date.UTC(values[0],values[1]-1,values[2],values[3],values[4]);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
 const shown=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute),epoch=Math.floor((guess-(shown-guess))/1000);
 return Number.isFinite(epoch)?epoch:now();
}

async function context() {
  const user = await getChatGPTUser();
  if (!user) throw new Error('You must sign in first.');
  const course = await ensureTeacher(user);
  return { user, course, db: env.DB };
}

async function canView(courseId:string,userId:string){
  const user=await getChatGPTUser();
  if(!user||user.userId!==userId)return false;
  if(user.readOnly)return !!await env.DB.prepare('SELECT id FROM courses WHERE id=? AND archived_at IS NULL').bind(courseId).first();
  return canEdit(courseId,userId);
}
async function canEdit(courseId: string, userId: string) {
  const user=await getChatGPTUser();
  if(!user||user.userId!==userId||user.readOnly)return false;
  return !!(await env.DB.prepare(`SELECT 1 AS ok FROM course_teachers ct JOIN courses c ON c.id=ct.course_id WHERE ct.course_id=? AND ct.teacher_id=? AND ct.role IN ('owner','editor') AND c.archived_at IS NULL`).bind(courseId,userId).first());
}

export async function getLiveClassroom(sessionId:string){
  const {user,course,db}=await context();
  if(!(await canView(course.id,user.userId)))throw new Error('You cannot view this course.');
  const session=await db.prepare(`SELECT id FROM class_sessions WHERE id=? AND course_id=? AND closed_at IS NULL`).bind(sessionId,course.id).first();
  if(!session)return [];
  const rows=await db.prepare(`SELECT s.student_number AS studentId,s.name,a.recorded_at AS checkedInAt,(SELECT COALESCE(SUM(pt.points),0) FROM point_transactions pt LEFT JOIN point_awards pa ON pa.id=pt.award_id LEFT JOIN point_transactions original ON original.id=pt.reverses_transaction_id LEFT JOIN point_awards original_pa ON original_pa.id=original.award_id WHERE pt.student_id=s.id AND COALESCE(pa.session_id,original_pa.session_id,pt.manual_session_id,original.manual_session_id)=?) AS classPoints,(SELECT COALESCE(SUM(pt.points),0) FROM point_transactions pt WHERE pt.student_id=s.id AND pt.course_id=?) AS totalPoints FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.session_id=? AND a.voided_at IS NULL ORDER BY a.recorded_at DESC,s.name`).bind(sessionId,course.id,sessionId).all<{studentId:string;name:string;checkedInAt:number;classPoints:number;totalPoints:number}>();
  return rows.results.map(row=>({...row,initials:initials(row.name)}));
}

export async function getCourseRecords(){const {user,course}=await context();if(!(await canView(course.id,user.userId)))throw new Error('You cannot view this course.');return loadCourseRecords(course.id)}

export async function awardPointsDirectly(input:{studentNumbers:string[];points:number;reason:string;sessionId:string|null;requestId:string}){
 const {user,course,db}=await context();if(!await canEdit(course.id,user.userId))throw Error('You cannot award points in this course.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId??''))throw Error('Refresh the form and try again.');
 if(!Number.isInteger(input.points)||input.points<1||input.points>100)throw Error('Enter a whole number of points from 1 to 100.');
 if(typeof input.reason!=='string'||!input.reason.trim())throw Error('Enter a reason for this award.');
 if(!Array.isArray(input.studentNumbers)||!input.studentNumbers.length||input.studentNumbers.length>500)throw Error('Select between 1 and 500 students.');
 const studentNumbers=[...new Set(input.studentNumbers.map(value=>typeof value==='string'?value.trim().toLowerCase():'').filter(Boolean))];
 if(!studentNumbers.length)throw Error('Select at least one student.');
 const previous=await db.prepare(`SELECT details FROM audit_log WHERE id=? AND course_id=? AND actor_id=? AND action='points.awarded_directly'`).bind(input.requestId,course.id,user.userId).first<{details:string}>();
 if(previous){const details=JSON.parse(previous.details) as {count?:number};return {created:Number.isInteger(details.count)?details.count!:studentNumbers.length};}
 const sessionId=input.sessionId===null?null:input.sessionId;
 if(sessionId!==null&&!await db.prepare('SELECT id FROM class_sessions WHERE id=? AND course_id=?').bind(sessionId,course.id).first())throw Error('Choose a class from this course or independent coursework.');
 const placeholders=studentNumbers.map(()=>'?').join(','),students=await db.prepare(`SELECT s.id,s.student_number AS studentNumber FROM students s JOIN enrolments e ON e.student_id=s.id WHERE e.course_id=? AND e.active=1 AND lower(trim(s.student_number)) IN (${placeholders})`).bind(course.id,...studentNumbers).all<{id:string;studentNumber:string}>();
 if(students.results.length!==studentNumbers.length)throw Error('One or more selected students are no longer enrolled. Refresh and try again.');
 const reason=input.reason.trim().slice(0,160),time=now(),details={source:'teacher_direct',teacherId:user.userId,studentNumbers,count:students.results.length,points:input.points,reason,sessionId};
 const statements=students.results.map(student=>db.prepare(`INSERT INTO point_transactions(id,course_id,student_id,points,reason,recorded_by,source,identity_verification,manual_session_id,created_at) VALUES (?,?,?,?,?,?,'teacher_direct','teacher_manual',?,?)`).bind(id(),course.id,student.id,input.points,reason,user.userId,sessionId,time));
 statements.push(db.prepare(`INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(input.requestId,course.id,user.userId,'points.awarded_directly','point_transaction_batch',input.requestId,JSON.stringify(details),time));
 try{await db.batch(statements)}catch(error){const saved=await db.prepare(`SELECT details FROM audit_log WHERE id=? AND course_id=? AND actor_id=? AND action='points.awarded_directly'`).bind(input.requestId,course.id,user.userId).first<{details:string}>();if(!saved)throw error;}
 revalidatePath('/');return {created:students.results.length};
}

export async function addManualRecord(input:{kind:'attendance'|'points';sessionId:string;studentNumber:string;points?:number;reason:string;requestId:string}){
 const {user,course,db}=await context();if(!await canEdit(course.id,user.userId))throw Error('You cannot add records to this course.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId??'')||!['attendance','points'].includes(input.kind)||typeof input.reason!=='string'||typeof input.studentNumber!=='string')throw Error('Refresh the form and enter valid record details.');
 if(input.kind==='points'&&(!Number.isInteger(input.points)||input.points!<1||input.points!>100))throw Error('Enter a whole number of points between 1 and 100.');
 const reason=input.reason.trim().slice(0,200)||'Teacher-added record',details=JSON.stringify({kind:input.kind,sessionId:input.sessionId,studentNumber:input.studentNumber.trim().toLowerCase(),points:input.kind==='points'?input.points:null,reason});
 const previous=()=>db.prepare('SELECT actor_id AS actorId,course_id AS courseId,details FROM audit_log WHERE id=?').bind(input.requestId).first<{actorId:string;courseId:string;details:string}>();
 const same=(row:{actorId:string;courseId:string;details:string})=>row.actorId===user.userId&&row.courseId===course.id&&row.details===details;
 const receipt=await previous();if(receipt){if(!same(receipt))throw Error('This submission was already used with different details. Reopen the form.');return;}
 const session=await db.prepare('SELECT id,opened_at AS openedAt FROM class_sessions WHERE id=? AND course_id=?').bind(input.sessionId,course.id).first<{id:string;openedAt:number}>();
 const students=await db.prepare('SELECT s.id FROM students s JOIN enrolments e ON e.student_id=s.id WHERE lower(trim(s.student_number))=? AND e.course_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL').bind(input.studentNumber.trim().toLowerCase(),course.id).all<{id:string}>();
 if(!session||students.results.length!==1)throw Error('Choose a class and a uniquely matched student who has joined this course.');
 const student=students.results[0],time=now(),recordId=id();
 const write=input.kind==='attendance'
  ?db.prepare(`INSERT INTO attendance(id,session_id,student_id,recorded_by,source,identity_verification,recorded_at) VALUES (?,?,?,?,'teacher_manual','teacher_confirmed',?) ON CONFLICT(session_id,student_id) DO UPDATE SET recorded_by=excluded.recorded_by,source=excluded.source,identity_verification=excluded.identity_verification,recorded_at=excluded.recorded_at,voided_at=NULL,voided_by=NULL,void_reason=NULL WHERE attendance.voided_at IS NOT NULL`).bind(recordId,session.id,student.id,user.userId,session.openedAt)
  :db.prepare(`INSERT INTO point_transactions(id,course_id,student_id,points,reason,recorded_by,source,identity_verification,manual_session_id,created_at) VALUES (?,?,?,?,?,?,'teacher_direct','teacher_manual',?,?)`).bind(recordId,course.id,student.id,input.points,reason,user.userId,session.id,time);
 try{const changes=await auditedWrite(db,write,course.id,user.userId,input.kind+'.added_manually',input.kind==='points'?'point_transaction':'attendance',input.kind==='points'?recordId:session.id,JSON.parse(details),time,input.requestId);if(!changes)throw Error('This student is already marked present.');}
 catch(error){const saved=await previous();if(!saved||!same(saved))throw error;}
 revalidatePath('/');
}

export async function voidAttendance(attendanceId:string,reason:string){
 const {user,course,db}=await context();if(!await canEdit(course.id,user.userId))throw Error('You cannot correct attendance for this course.');
 if(typeof reason!=='string')throw Error('Enter a correction reason.');
 const cleanReason=reason.trim().slice(0,200)||'Teacher correction',time=now();
 const changes=await auditedWrite(db,db.prepare('UPDATE attendance SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND voided_at IS NULL AND session_id IN (SELECT id FROM class_sessions WHERE course_id=?)').bind(time,user.userId,cleanReason,attendanceId,course.id),course.id,user.userId,'attendance.voided','attendance',attendanceId,{reason:cleanReason},time);
 if(!changes)throw Error('This attendance record was already corrected or is unavailable.');revalidatePath('/');
}

export async function reversePointTransaction(transactionId:string,reason:string){
 const {user,course,db}=await context();if(!await canEdit(course.id,user.userId))throw Error('You cannot correct points for this course.');
 if(typeof reason!=='string')throw Error('Enter a correction reason.');
 const original=await db.prepare('SELECT id,student_id AS studentId,points,reason FROM point_transactions WHERE id=? AND course_id=? AND points>0 AND reverses_transaction_id IS NULL').bind(transactionId,course.id).first<{id:string;studentId:string;points:number;reason:string}>();
 if(!original)throw Error('These points cannot be corrected.');
 const cleanReason=reason.trim().slice(0,200)||'Teacher correction',reversalId=id(),time=now();
 const write=db.prepare(`INSERT INTO point_transactions(id,course_id,student_id,points,reason,recorded_by,source,identity_verification,reverses_transaction_id,created_at) SELECT ?,?,?,?,?,?,'teacher_correction','teacher_correction',?,? WHERE NOT EXISTS (SELECT 1 FROM point_transactions WHERE reverses_transaction_id=?)`).bind(reversalId,course.id,original.studentId,-original.points,'Reversal: '+cleanReason,user.userId,original.id,time,original.id);
 const changes=await auditedWrite(db,write,course.id,user.userId,'points.reversed','point_transaction',reversalId,{originalTransactionId:original.id,points:original.points,originalReason:original.reason,reason:cleanReason},time);
 if(!changes)throw Error('These points were already reversed.');revalidatePath('/');
}

export async function createCourse(input:{code:string;name:string;teacherIds:string[]}){
  const user=await getChatGPTUser();
  if(!user)throw new Error('You must sign in first.');
  if(user.readOnly)throw Error('Read-only test access cannot change data.');
  await ensureTeacher(user);
  const db=env.DB,code=input.code.trim().toUpperCase().replace(/\s+/g,'').slice(0,20),name=input.name.trim().slice(0,100);
  if(code.length<2)throw new Error('Enter a short course code, such as BIO204.');
  if(name.length<3)throw new Error('Enter the course name.');
  const duplicate=await db.prepare(`SELECT 1 AS ok FROM courses c JOIN course_teachers ct ON ct.course_id=c.id WHERE ct.teacher_id=? AND lower(c.code)=lower(?) AND c.archived_at IS NULL`).bind(user.userId,code).first();
  if(duplicate)throw new Error('You already have a course with that code.');
  const courseId=id();
  const directory=process.env.PILOT_MODE==='true'?await getPilotTeacherDirectory():[],allowed=new Map(directory.map(teacher=>[teacher.id,teacher])),additional=[...new Set(input.teacherIds)].filter(teacherId=>teacherId!==user.userId&&allowed.has(teacherId));
  const statements=[
    db.prepare(`INSERT INTO courses (id,code,name,owner_id,created_at) VALUES (?,?,?,?,?)`).bind(courseId,code,name,user.userId,now()),
    db.prepare(`INSERT INTO course_teachers (course_id,teacher_id,role,invited_by,joined_at) VALUES (?,?,?,?,?)`).bind(courseId,user.userId,'owner',user.userId,now()),
  ];
  for(const teacherId of additional){const teacher=allowed.get(teacherId)!;statements.push(db.prepare(`INSERT INTO users (id,email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name`).bind(teacher.id,teacher.email,teacher.displayName,now()),db.prepare(`INSERT INTO course_teachers (course_id,teacher_id,role,invited_by,joined_at) VALUES (?,?,?,?,?)`).bind(courseId,teacher.id,'editor',user.userId,now()))}
  await db.batch(statements);
  (await cookies()).set('pulse_active_course',courseId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:365*24*60*60});
  revalidatePath('/');
  return {courseId};
}

export async function switchCourse(courseId:string){
  const user=await getChatGPTUser();
  if(!user)throw new Error('You must sign in first.');
  const allowed=await canView(courseId,user.userId);
  if(!allowed)throw new Error('You cannot access this course.');
  (await cookies()).set('pulse_active_course',courseId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:365*24*60*60});
  revalidatePath('/');
}

export async function importRoster(courseId:string,filename:string,rows:RosterStudent[],replace=false){
  const {user,course,db}=await timetableContext(courseId);
  if(rosterCourseCode(filename).toLowerCase()!==course.code.toLowerCase())throw Error('The filename does not match the selected course.');
  if(typeof replace!=='boolean')throw Error('Choose a valid import mode.');
  const clean=validateRoster(rows),statements:D1PreparedStatement[]=[];
  // Institutional identity is shared across courses. A course import may reuse
  // it, but may never silently overwrite it, even for a course's own students.
  for(const row of clean){
    const existing=await db.prepare('SELECT name,email FROM students WHERE lower(trim(student_number))=?').bind(row.studentId).all<{name:string;email:string|null}>();
    if(existing.results.length>1)throw Error('Student ID '+row.studentId+' has conflicting existing records. Ask an administrator to reconcile them; no students were imported.');
    const student=existing.results[0];
    if(student&&(student.name.trim()!==row.name||(student.email??'').trim().toLowerCase()!==row.email))throw Error('Identity details for '+row.studentId+' differ from the existing student record. Match the verified record or ask an administrator to correct it before importing. No students were imported.');
  }
  if(replace)statements.push(db.prepare('UPDATE enrolments SET active=0 WHERE course_id=?').bind(courseId));
  for(const row of clean){
    statements.push(db.prepare(`INSERT INTO students(id,student_number,name,email) SELECT ?,?,?,NULLIF(?,'') WHERE NOT EXISTS (SELECT 1 FROM students WHERE lower(trim(student_number))=?)`).bind(id(),row.studentId,row.name,row.email,row.studentId));
    // A concurrent conflicting identity makes the scalar subquery NULL and
    // fails the NOT NULL constraint, rolling back the entire batch.
    statements.push(db.prepare(`INSERT INTO enrolments(course_id,student_id,active,groups) VALUES (?,(SELECT id FROM students WHERE lower(trim(student_number))=? AND trim(name)=? AND lower(trim(COALESCE(email,'')))=?),1,?) ON CONFLICT(course_id,student_id) DO UPDATE SET active=1,groups=excluded.groups`).bind(courseId,row.studentId,row.name,row.email,row.groups));
  }
  statements.push(db.prepare('INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id(),courseId,user.userId,replace?'roster.replaced':'roster.imported','course',courseId,JSON.stringify({count:clean.length,filename}),now()));
  await db.batch(statements);revalidatePath('/');revalidatePath('/courses');revalidatePath('/league/'+courseId);return {count:clean.length};
}

export async function openSession(input:{title:string;room:string;attendanceMinutes:number}){
  const {user,course,db}=await context();
  if(!await canEdit(course.id,user.userId))throw Error('You cannot start sessions.');
  if(typeof input.title!=='string'||typeof input.room!=='string'||input.title.length>200||input.room.length>100||!Number.isInteger(input.attendanceMinutes)||input.attendanceMinutes<5||input.attendanceMinutes>240)throw Error('Enter a valid class title, room and attendance window (5 to 240 minutes).');
  const token=crypto.randomUUID()+crypto.randomUUID(),digest=await digestToken(token),sessionId=id(),time=now(),expiresAt=time+input.attendanceMinutes*60;
  const write=db.prepare(`INSERT INTO class_sessions(id,course_id,title,room,attendance_token_digest,attendance_expires_at,attendance_duration_minutes,opened_by,opened_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM courses WHERE id=? AND archived_at IS NULL) AND NOT EXISTS (SELECT 1 FROM class_sessions WHERE course_id=? AND closed_at IS NULL)`).bind(sessionId,course.id,input.title.trim()||'Class session',input.room.trim()||null,digest,expiresAt,input.attendanceMinutes,user.userId,time,course.id,course.id);
  const changes=await auditedWrite(db,write,course.id,user.userId,'session.opened','class_session',sessionId,{title:input.title.trim(),room:input.room.trim()},time);
  if(!changes)throw Error('Close the active session before starting another class.');
  revalidatePath('/');return {urlPath:'/redeem/attendance/'+token,expiresAt};
}

export async function closeSession(sessionId:string){
 const {user,course,db}=await context();if(!await canEdit(course.id,user.userId))throw Error('You cannot close sessions.');
 await auditedWrite(db,db.prepare('UPDATE class_sessions SET closed_at=? WHERE id=? AND course_id=? AND closed_at IS NULL').bind(now(),sessionId,course.id),course.id,user.userId,'session.closed','class_session',sessionId,null,now());revalidatePath('/');
}

export async function rotateAttendanceToken(sessionId: string) {
  const { user, course, db } = await context();
  if (!(await canEdit(course.id,user.userId))) throw new Error('You cannot manage this session.');
  const session=await db.prepare(`SELECT attendance_duration_minutes AS durationMinutes FROM class_sessions WHERE id=? AND course_id=? AND closed_at IS NULL`).bind(sessionId,course.id).first<{durationMinutes:number}>();
  if(!session)throw new Error('The session is no longer active.');
  const token = crypto.randomUUID() + crypto.randomUUID();
  const digest = await digestToken(token);
  const expiresAt=now()+session.durationMinutes*60;
  const result = await db.prepare(`UPDATE class_sessions SET attendance_token_digest=?,attendance_expires_at=? WHERE id=? AND course_id=? AND closed_at IS NULL`).bind(digest,expiresAt,sessionId,course.id).run();
  if (!result.meta.changes) throw new Error('The session is no longer active.');
  return { urlPath: `/redeem/attendance/${token}`, expiresAt };
}

export async function generateOnboardingQr() {
  const {user,course,db}=await context();
  if(!(await canEdit(course.id,user.userId)))throw new Error('You cannot manage this course.');
  // Store the printable token durably: its digest alone cannot recreate a QR.
  // The course primary key makes simultaneous first opens choose one winner.
  const token=crypto.randomUUID()+crypto.randomUUID(),digest=await digestToken(token);
  await db.prepare(`INSERT INTO course_onboarding_qrs (course_id,token,token_digest) VALUES (?,?,?) ON CONFLICT(course_id) DO NOTHING`).bind(course.id,token,digest).run();
  const qr=await db.prepare(`SELECT token FROM course_onboarding_qrs WHERE course_id=?`).bind(course.id).first<{token:string}>();
  if(!qr)throw new Error('Could not load the course joining QR. Please try again.');
  // Keep the pre-upgrade digest untouched so the last shared legacy QR still works.
  return {urlPath:`/redeem/onboarding/${qr.token}`};
}

export async function createAward(input: {sessionId:string|null;points:number;reason:string;expiresSeconds:number;recipientStudentNumbers?:string[];expiryMode?:AwardExpiryMode}) {
  const { user, course, db } = await context();
  if (!(await canEdit(course.id,user.userId))) throw new Error('You cannot create awards.');
  const clean=validateAwardInput(input);
  if(clean.sessionId){
    const session=await db.prepare('SELECT id FROM class_sessions WHERE id=? AND course_id=? AND closed_at IS NULL').bind(clean.sessionId,course.id).first();
    if(!session)throw Error('This class is no longer active. Choose independent coursework or start a class.');
  }
  const roster=await db.prepare('SELECT s.id,lower(s.student_number) AS studentNumber FROM students s JOIN enrolments e ON e.student_id=s.id WHERE e.course_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL').bind(course.id).all<{id:string;studentNumber:string}>();
  const byNumber=new Map(roster.results.map(s=>[s.studentNumber,s.id]));
  const recipients=clean.recipientStudentNumbers?.map(number=>{
    const studentId=byNumber.get(number);
    if(!studentId)throw Error('A selected student has not joined this course. Refresh the roster and select again.');
    return studentId;
  });
  const token=crypto.randomUUID()+crypto.randomUUID(),digest=await digestToken(token),awardId=id(),time=now(),expiresAt=clean.expiryMode==='timed'?time+clean.expiresSeconds:null;
  const statements=[db.prepare('INSERT INTO point_awards (id,session_id,course_id,points,reason,token_digest,awarded_by,expires_at,created_at,restricted,expiry_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(awardId,clean.sessionId,course.id,clean.points,clean.reason,digest,user.userId,expiresAt??0,time,recipients?1:0,clean.expiryMode)];
  // Batch atomically: a restricted award must never exist with a partial recipient list.
  if(recipients)statements.push(db.prepare('INSERT INTO point_award_recipients (award_id,student_id) SELECT ?,value FROM json_each(?)').bind(awardId,JSON.stringify(recipients)));
  statements.push(db.prepare('INSERT INTO audit_log (id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id(),course.id,user.userId,'award.created','point_award',awardId,JSON.stringify({points:clean.points,reason:clean.reason,sessionId:clean.sessionId,scope:clean.sessionId?'class':'independent_coursework',expiryMode:clean.expiryMode,expiresAt,recipientStudentIds:recipients??null}),time));
  await db.batch(statements);
  return {urlPath:`/redeem/points/${token}`,expiresAt,expiryMode:clean.expiryMode,awardId};
}

export async function closePointAward(awardId:string) {
  const {user,course,db}=await context();
  if(!(await canEdit(course.id,user.userId)))throw Error('You cannot manage this award.');
  const award=await db.prepare('SELECT pa.id FROM point_awards pa LEFT JOIN class_sessions cs ON cs.id=pa.session_id WHERE pa.id=? AND COALESCE(pa.course_id,cs.course_id)=? AND pa.closed_at IS NULL').bind(awardId,course.id).first();
  if(!award)throw Error('This QR is already deactivated or unavailable.');
  const time=now();
  await db.batch([
    db.prepare('UPDATE point_awards SET closed_at=? WHERE id=? AND closed_at IS NULL').bind(time,awardId),
    db.prepare('INSERT INTO audit_log (id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id(),course.id,user.userId,'award.closed','point_award',awardId,null,time),
  ]);
  revalidatePath('/');
}

export async function redeem(kind: 'attendance'|'points', token: string) {
  const user = await getChatGPTUser();
  if (!user) return redemptionFailure(kind,'SIGN-IN','Sign in to continue, then return to this QR.');
  if(user.readOnly)return redemptionFailure(kind,'READ-ONLY','Read-only test access cannot change data.');
  if(!validRedemption(kind,token)||!user.identityProvider||!user.identitySubject)return redemptionFailure(kind,'SIGN-IN','Verified student sign-in is required.');
  const db=env.DB;
  const student=await db.prepare('SELECT s.id FROM student_identity_links l JOIN students s ON s.id=l.student_id WHERE l.provider=? AND l.subject=?').bind(user.identityProvider,user.identitySubject).first<{id:string}>();
  if(!student)return redemptionFailure(kind,'ACCOUNT-NOT-LINKED','Your signed-in identity has not been linked to a student record. Give your teacher this sign-in reference after verifying your identity: '+user.identitySubject);
  await db.prepare('INSERT INTO users (id,email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(user.userId,user.email,user.displayName,now()).run();
  const digest = await digestToken(token);
  if (kind === 'attendance') {
    const session = await db.prepare(`SELECT cs.id,cs.course_id AS courseId,cs.title FROM class_sessions cs JOIN courses c ON c.id=cs.course_id AND c.archived_at IS NULL JOIN enrolments e ON e.course_id=cs.course_id AND e.student_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL WHERE cs.attendance_token_digest=? AND cs.closed_at IS NULL AND cs.attendance_expires_at>=?`).bind(student.id,digest,now()).first<{id:string;courseId:string;title:string}>();
    if (!session) return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
    const result = await db.prepare(`INSERT INTO attendance (id,session_id,student_id,recorded_by,source,identity_verification,recorded_at)
      SELECT ?,cs.id,e.student_id,?,?,?,? FROM class_sessions cs JOIN courses c ON c.id=cs.course_id JOIN enrolments e ON e.course_id=c.id
      WHERE cs.id=? AND cs.attendance_token_digest=? AND cs.closed_at IS NULL AND cs.attendance_expires_at>=? AND c.archived_at IS NULL AND e.student_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL
      ON CONFLICT(session_id,student_id) DO NOTHING`).bind(id(),user.userId,'qr',user.identityProvider!,now(),session.id,digest,now(),student.id).run();
    const recorded=await db.prepare('SELECT voided_at AS voidedAt FROM attendance WHERE session_id=? AND student_id=?').bind(session.id,student.id).first<{voidedAt:number|null}>();
    if(recorded?.voidedAt!=null)return redemptionFailure(kind,'CORRECTED','A teacher corrected this attendance record. Only a teacher can restore it.');
    if(!recorded)return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
    return { ok:true, message: result.meta.changes ? `Attendance recorded for ${session.title}.` : 'Your attendance was already recorded.' };
  }
  const award = await db.prepare(eligiblePointAward).bind(student.id,digest,now()).first<EligiblePointAward>();
  if (!award) return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
  const result = await db.prepare(claimPointAward).bind(id(),student.id,user.userId,user.identityProvider!,now(),student.id,digest,now()).run();
  if(!result.meta.changes&&!(await db.prepare('SELECT id FROM point_transactions WHERE award_id=? AND student_id=?').bind(award.id,student.id).first()))return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
  return { ok:true, message: result.meta.changes ? `You received ${award.points} point${award.points===1?'':'s'}: ${award.reason}.` : 'You already claimed this award.' };
}

export async function redeemPilot(kind: 'attendance'|'points'|'onboarding', token: string, studentNumber: string) {
  if(!validRedemption(kind,token)||typeof studentNumber!=='string'||studentNumber.length>100)return redemptionFailure(kind,'INVALID-INPUT','Enter a valid student number and QR.');
  if((await getChatGPTUser())?.readOnly)return redemptionFailure(kind,'READ-ONLY','Read-only test access cannot change data.');
  if (process.env.PILOT_MODE !== 'true'||process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS!=='true') return redemptionFailure(kind,'PILOT-DISABLED','Pilot access is unavailable. Ask your teacher which sign-in method to use.');
  const db = env.DB;
  const number = studentNumber.trim();
  if (!number) return redemptionFailure(kind,'NUMBER-REQUIRED','Enter your student number, such as 12345 or fc12345.');
  if (!(await studentAttemptAllowed(number,token))) return redemptionFailure(kind,'TOO-MANY-ATTEMPTS','Too many incorrect student-number attempts. Wait ten minutes before trying again.');
  const student = await findPilotStudent(db,number);
  if (!student) { return redemptionFailure(kind,'NUMBER-NOT-FOUND','Your student number could not be uniquely matched to the imported roster. Enter 12345 or fc12345, not an email address. If it still fails, ask your teacher to check the number in the roster.'); }
  const digest = await digestToken(token);
  if(kind==='onboarding'){
    const enrolment=await db.prepare(`SELECT e.course_id AS courseId,e.checked_in_at AS checkedInAt FROM enrolments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=? AND e.active=1 AND ? IN (c.onboarding_token_digest,(SELECT token_digest FROM course_onboarding_qrs WHERE course_id=c.id)) AND c.archived_at IS NULL`).bind(student.id,digest).first<{courseId:string;checkedInAt:number|null}>();
    if(!enrolment)return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
    return {ok:true,message:enrolment.checkedInAt?'This student number has already joined this course.':'Choose an animal nickname to finish joining.',courseId:enrolment.courseId,...(await pilotNicknameState(student.id,enrolment.courseId))};
  }
  if (kind === 'attendance') {
    const session = await db.prepare(`SELECT cs.id,cs.course_id AS courseId,cs.title,cs.opened_by AS recordedBy FROM class_sessions cs JOIN courses c ON c.id=cs.course_id AND c.archived_at IS NULL JOIN enrolments e ON e.course_id=cs.course_id AND e.student_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL WHERE cs.attendance_token_digest=? AND cs.closed_at IS NULL AND cs.attendance_expires_at>=?`).bind(student.id,digest,now()).first<{id:string;courseId:string;title:string;recordedBy:string}>();
    if (!session) return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
    const result = await db.prepare(`INSERT INTO attendance (id,session_id,student_id,recorded_by,source,identity_verification,recorded_at)
      SELECT ?,cs.id,e.student_id,?,?,?,? FROM class_sessions cs JOIN courses c ON c.id=cs.course_id JOIN enrolments e ON e.course_id=c.id
      WHERE cs.id=? AND cs.attendance_token_digest=? AND cs.closed_at IS NULL AND cs.attendance_expires_at>=? AND c.archived_at IS NULL AND e.student_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL
      ON CONFLICT(session_id,student_id) DO NOTHING`).bind(id(),session.recordedBy,'pilot','pilot_student_number',now(),session.id,digest,now(),student.id).run();
    const recorded=await db.prepare('SELECT voided_at AS voidedAt FROM attendance WHERE session_id=? AND student_id=?').bind(session.id,student.id).first<{voidedAt:number|null}>();
    if(recorded?.voidedAt!=null)return redemptionFailure(kind,'CORRECTED','A teacher corrected this attendance record. Only a teacher can restore it.');
    if(!recorded)return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
    return { ok:true, message:result.meta.changes?'Attendance recorded.':'Attendance was already recorded.', courseId:session.courseId, ...(await pilotNicknameState(student.id,session.courseId)) };
  }
  const award = await db.prepare(eligiblePointAward).bind(student.id,digest,now()).first<EligiblePointAward>();
  if (!award) return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
  const result = await db.prepare(claimPointAward).bind(id(),student.id,award.recordedBy,'pilot_student_number',now(),student.id,digest,now()).run();
  if(!result.meta.changes&&!(await db.prepare('SELECT id FROM point_transactions WHERE award_id=? AND student_id=?').bind(award.id,student.id).first()))return diagnoseRedemptionFailure(db,kind,digest,student.id,now());
  return { ok:true, message:result.meta.changes?`Received ${award.points} point${award.points===1?'':'s'}: ${award.reason}.`:'This award was already claimed.', courseId:award.courseId, ...(await pilotNicknameState(student.id,award.courseId)) };
}

export async function choosePilotNickname(kind:'attendance'|'points'|'onboarding',token:string,studentNumber:string,nickname:string){
 if((await getChatGPTUser())?.readOnly)return redemptionFailure(kind,'READ-ONLY','Read-only test access cannot change data.');
 if(process.env.PILOT_MODE!=='true'||process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS!=='true')return redemptionFailure(kind,'PILOT-DISABLED','Unverified student access is disabled.');
 if(!validRedemption(kind,token)||typeof studentNumber!=='string'||studentNumber.length>100)return redemptionFailure(kind,'INVALID-INPUT','Enter a valid student number and QR.');
 if(!await studentAttemptAllowed(studentNumber,token))return redemptionFailure(kind,'TOO-MANY-ATTEMPTS','Too many attempts. Wait ten minutes and try again.');
 const canonical=canonicalNickname(nickname);if(!canonical)return redemptionFailure(kind,'NICKNAME-REQUIRED','Choose an animal nickname from the list.');
 const db=env.DB,matched=await findPilotStudent(db,studentNumber),digest=await digestToken(token),time=now();
 if(!matched)return redemptionFailure(kind,'NUMBER-NOT-FOUND','The student number could not be uniquely matched.');
 const eligible=kind==='points'?`SELECT eligible.courseId FROM (${eligiblePointAward}) eligible`
 :kind==='onboarding'?`SELECT c.id AS courseId FROM courses c JOIN enrolments e ON e.course_id=c.id WHERE e.student_id=? AND e.active=1 AND ? IN (c.onboarding_token_digest,(SELECT token_digest FROM course_onboarding_qrs WHERE course_id=c.id)) AND c.archived_at IS NULL`
 :`SELECT c.id AS courseId FROM courses c JOIN enrolments e ON e.course_id=c.id JOIN class_sessions cs ON cs.course_id=c.id WHERE e.student_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL AND cs.attendance_token_digest=? AND cs.attendance_expires_at>=? AND cs.closed_at IS NULL AND c.archived_at IS NULL`;
 const args=kind==='onboarding'?[matched.id,digest]:[matched.id,digest,time];
 const course=await db.prepare(eligible).bind(...args).first<{courseId:string}>();if(!course)return diagnoseRedemptionFailure(db,kind,digest,matched.id,time);
 const statements=[db.prepare(`INSERT INTO leaderboard_preferences(course_id,student_id,visibility,alias) SELECT eligible.courseId,?,'public',? FROM (${eligible}) eligible WHERE 1 ON CONFLICT(course_id,student_id) DO UPDATE SET alias=excluded.alias,visibility='public' WHERE leaderboard_preferences.alias IS NULL OR leaderboard_preferences.alias=''`).bind(matched.id,canonical,...args)];
 if(kind==='onboarding'){
  statements.push(db.prepare(`UPDATE enrolments SET checked_in_at=? WHERE student_id=? AND checked_in_at IS NULL AND active=1 AND course_id IN (${eligible}) AND EXISTS (SELECT 1 FROM leaderboard_preferences lp WHERE lp.student_id=enrolments.student_id AND lp.course_id=enrolments.course_id AND lp.alias IS NOT NULL AND lp.alias!='')`).bind(time,matched.id,...args));
  statements.push(db.prepare(`INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) SELECT ?,c.id,c.owner_id,'student.onboarded','enrolment',?,?,? FROM courses c WHERE c.id=? AND changes()>0`).bind(id(),matched.id,JSON.stringify({source:'unverified_test'}),time,course.courseId));
 }
 try{await db.batch(statements)}catch(error){if(String(error).includes('UNIQUE'))return redemptionFailure(kind,'NICKNAME-UNAVAILABLE','That nickname is no longer available. Choose another animal.');throw error;}
 const saved=await db.prepare(`SELECT lp.alias FROM leaderboard_preferences lp JOIN enrolments e ON e.course_id=lp.course_id AND e.student_id=lp.student_id WHERE lp.course_id=? AND lp.student_id=? AND e.active=1 AND (?!=1 OR e.checked_in_at IS NOT NULL)`).bind(course.courseId,matched.id,kind==='onboarding'?1:0).first<{alias:string}>();
 if(!saved?.alias)return diagnoseRedemptionFailure(db,kind,digest,matched.id,time);
 return {ok:true,nickname:saved.alias,courseId:course.courseId};
}

async function pilotNicknameState(studentId:string,courseId:string){
  const db=env.DB,current=await db.prepare(`SELECT alias FROM leaderboard_preferences WHERE course_id=? AND student_id=? AND visibility!='private'`).bind(courseId,studentId).first<{alias:string|null}>(),used=await db.prepare(`SELECT alias FROM leaderboard_preferences WHERE course_id=? AND alias IS NOT NULL`).bind(courseId).all<{alias:string}>(),taken=new Set(used.results.map(row=>row.alias.toLocaleLowerCase('pt')));
  return {nickname:current?.alias??null,availableNicknames:nicknameOptions(taken)};
}

function canonicalNickname(value:unknown){
  if(typeof value!=='string'||value.length>100)return null;
  const match=/^(.*?)(?: #([2-9]|[1-9][0-9]{1,5}))?$/.exec(value.trim());
  if(!match)return null;
  const animal=ANIMAL_NICKNAMES.find(name=>name.toLocaleLowerCase('pt')===match[1].toLocaleLowerCase('pt'));
  return animal?animal+(match[2]?' #'+match[2]:''):null;
}
function nicknameOptions(taken:Set<string>){
  const options:string[]=[];
  for(let suffix=1;options.length<ANIMAL_NICKNAMES.length;suffix++)for(const animal of ANIMAL_NICKNAMES){
    const value=animal+(suffix===1?'':' #'+suffix);
    if(!taken.has(value.toLocaleLowerCase('pt')))options.push(value);
    if(options.length===ANIMAL_NICKNAMES.length)break;
  }
  return options;
}

async function auditedWrite(db:D1Database,write:D1PreparedStatement,courseId:string,actorId:string,action:string,entityType:string,entityId:string,details:unknown,time:number,auditId=id()){
 const results=await db.batch([write,db.prepare('INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(auditId,courseId,actorId,action,entityType,entityId,details===null?null:JSON.stringify(details),time)]);
 return results[0].meta.changes;
}

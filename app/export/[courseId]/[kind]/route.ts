import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { loadCourseBackup, loadCourseRecords } from '../../../course-records';

export async function GET(_request:Request,{params}:{params:Promise<{courseId:string;kind:string}>}){
  const user=await getChatGPTUser(),{courseId,kind}=await params;
  if(!user)return new Response('Sign in required.',{status:401});
  const allowed=await env.DB.prepare(`SELECT c.code FROM courses c WHERE (?=1 OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id=c.id AND ct.teacher_id=?)) AND c.id=? AND c.archived_at IS NULL`).bind(user.readOnly?1:0,user.userId,courseId).first<{code:string}>();
  if(!allowed)return new Response('Course access denied.',{status:403});
  if(kind==='backup')return new Response(JSON.stringify(await loadCourseBackup(courseId),null,2),{headers:{'cache-control':'private, no-store','content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="${allowed.code}-backup.json"`}});
  const records=await loadCourseRecords(courseId);
  const table=kind==='enrolments'?{headers:['Student ID','Student','Animal nickname','Email','Groups','Joining status','Joined at'],rows:records.enrolments.map(row=>[row.studentId,row.name,row.nickname,row.email,row.groups,row.checkedInAt!==null?'Joined':'Not joined',row.checkedInAt!==null?date(row.checkedInAt):''])}:kind==='events'?{headers:['Date and time','Event','Student ID','Student','Animal nickname','Session','Details','Source','Teacher','Points'],rows:records.events.map(row=>[date(row.time),row.eventType,row.studentId,row.name,row.nickname,row.session,row.details,row.source,row.actor,row.points??''])}:kind==='league'?{headers:['Rank','Student ID','Student','Animal nickname','Email','Points'],rows:records.league.map((row,index)=>[index+1,row.studentId,row.name,row.nickname,row.email,row.points])}:kind==='attendance'?{headers:['Date and time','Student ID','Student','Animal nickname','Session','Room','Source','Verification','Status','Correction reason','Corrected by'],rows:records.attendance.map(row=>[date(row.time),row.studentId,row.name,row.nickname,row.session,row.room,row.source,row.verification,row.voidedAt?'Corrected':'Present',row.voidReason,row.voidedBy])}:kind==='checked-in'?{headers:['Joined at','Student ID','Student','Email','Animal nickname','Classes attended','Participation interactions','Points'],rows:records.checkedIn.map(row=>[date(row.checkedInAt),row.studentId,row.name,row.email,row.nickname,row.classesAttended,row.interactions,row.points])}:null;
  if(!table)return new Response('Unknown export.',{status:404});
  const safeCell=(value:unknown)=>{const text=String(value??'');return typeof value==='string'&&/^[\s\uFEFF]*[=+@\-]|^[\t\r\n]/.test(text)?"'"+text:text;};
  const quote=(value:unknown)=>`"${safeCell(value).replaceAll('"','""')}"`,csv='\uFEFF'+[table.headers,...table.rows].map(row=>row.map(quote).join(',')).join('\r\n');
  return new Response(csv,{headers:{'cache-control':'private, no-store','content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${allowed.code}-${kind}.csv"`}});
}
function date(seconds:number){return new Date(seconds*1000).toISOString()}

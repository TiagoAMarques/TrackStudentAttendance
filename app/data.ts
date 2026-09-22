import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import type { ChatGPTUser } from './chatgpt-auth';

export type DashboardData = {
  readOnly?: boolean;
  teacherAdmin?: boolean;
  pilotOrigin: string | null;
  user: { id: string; displayName: string; initials: string };
  course: { id: string; code: string; name: string };
  courses: Array<{ id: string; code: string; name: string; registered:number; joined:number }>;
  availableTeachers: Array<{ id: string; displayName: string; email: string }>;
  session: null | { id: string; title: string; room: string; openedAt: number; present: number; expiresAt: number; durationMinutes: number };
  presentStudents: Array<{ studentId: string; name: string; initials: string; checkedInAt: number; classPoints: number; totalPoints: number }>;
  roster: Array<{ studentId: string; name: string; email: string; checkedInAt:number|null; nickname:string }>;
  feed: Array<{ id: string; name: string; note: string; time: number; initials: string }>;
  leaders: Array<{ label: string; points: number }>;
  classLeaders: Array<{ label: string; points: number }>;
};

const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();

export async function digestToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function ensureTeacher(user: ChatGPTUser) {
  const db = env.DB;
  if(!user.teacherAccess&&!await db.prepare("SELECT 1 FROM course_teachers WHERE teacher_id=? AND role IN ('owner','editor') LIMIT 1").bind(user.userId).first())throw Error('Teacher access has not been granted to this account.');
  if(user.readOnly){
    const selectedId=(await cookies()).get('pulse_active_course')?.value;
    const course=await db.prepare('SELECT id,code,name FROM courses WHERE archived_at IS NULL ORDER BY (id=?) DESC,created_at LIMIT 1').bind(selectedId??'').first<{id:string;code:string;name:string}>();
    if(!course)throw Error('No active courses are available to view.');
    return course;
  }
  await db.prepare(`INSERT INTO users (id,email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name`).bind(user.userId, user.email, user.displayName, now()).run();
  const selectedId=(await cookies()).get('pulse_active_course')?.value;
  let course = selectedId ? await db.prepare(`SELECT c.id,c.code,c.name FROM courses c JOIN course_teachers ct ON ct.course_id=c.id WHERE ct.teacher_id=? AND c.id=? AND c.archived_at IS NULL LIMIT 1`).bind(user.userId,selectedId).first<{id:string;code:string;name:string}>() : null;
  course ??= await db.prepare(`SELECT c.id,c.code,c.name FROM courses c JOIN course_teachers ct ON ct.course_id=c.id WHERE ct.teacher_id=? AND c.archived_at IS NULL ORDER BY c.created_at LIMIT 1`).bind(user.userId).first<{id:string;code:string;name:string}>();
  if (!course) {
    const courseId = id();
    await db.batch([
      db.prepare(`INSERT INTO courses (id,code,name,owner_id,created_at) VALUES (?,?,?,?,?)`).bind(courseId, 'BIO204', 'Ecological Statistics', user.userId, now()),
      db.prepare(`INSERT INTO course_teachers (course_id,teacher_id,role,invited_by,joined_at) VALUES (?,?,?,?,?)`).bind(courseId, user.userId, 'owner', user.userId, now()),
    ]);
    course = { id: courseId, code: 'BIO204', name: 'Ecological Statistics' };
  }
  return course;
}

export async function getDashboard(user: ChatGPTUser): Promise<DashboardData> {
  const db = env.DB;
  const course = await ensureTeacher(user);
  const courses = await db.prepare(`SELECT c.id,c.code,c.name,(SELECT COUNT(*) FROM enrolments e WHERE e.course_id=c.id AND e.active=1) AS registered,(SELECT COUNT(*) FROM enrolments e WHERE e.course_id=c.id AND e.active=1 AND e.checked_in_at IS NOT NULL) AS joined FROM courses c WHERE (?=1 OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id=c.id AND ct.teacher_id=?)) AND c.archived_at IS NULL ORDER BY c.created_at,c.name`).bind(user.readOnly?1:0,user.userId).all<{id:string;code:string;name:string;registered:number;joined:number}>();
  const availableTeachers = process.env.PILOT_MODE==='true' ? await (await import('./pilot-auth')).getPilotTeacherDirectory() : [{id:user.userId,displayName:user.displayName,email:user.email}];
  const session = await db.prepare(`SELECT id,title,room,opened_at AS openedAt,attendance_expires_at AS expiresAt,attendance_duration_minutes AS durationMinutes FROM class_sessions WHERE course_id=? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`).bind(course.id).first<{id:string;title:string;room:string;openedAt:number;expiresAt:number;durationMinutes:number}>();
  const roster = await db.prepare(`SELECT s.student_number AS studentId,s.name,COALESCE(s.email,'') AS email,e.checked_in_at AS checkedInAt,COALESCE(lp.alias,'') AS nickname FROM students s JOIN enrolments e ON e.student_id=s.id LEFT JOIN leaderboard_preferences lp ON lp.course_id=e.course_id AND lp.student_id=e.student_id WHERE e.course_id=? AND e.active=1 ORDER BY s.name`).bind(course.id).all<{studentId:string;name:string;email:string;checkedInAt:number|null;nickname:string}>();
  const feed = await db.prepare(`SELECT a.id,s.name,'Attendance confirmed' AS note,a.recorded_at AS time FROM attendance a JOIN students s ON s.id=a.student_id JOIN class_sessions cs ON cs.id=a.session_id WHERE cs.course_id=? AND a.voided_at IS NULL UNION ALL SELECT pt.id,s.name,printf('%+d · %s',pt.points,pt.reason) AS note,pt.created_at AS time FROM point_transactions pt JOIN students s ON s.id=pt.student_id WHERE pt.course_id=? ORDER BY time DESC LIMIT 12`).bind(course.id, course.id).all<{id:string;name:string;note:string;time:number}>();
  const leaders = await db.prepare(`SELECT COALESCE(NULLIF(lp.alias,''),s.student_number) AS label,COALESCE(SUM(pt.points),0) AS points FROM enrolments e JOIN students s ON s.id=e.student_id LEFT JOIN leaderboard_preferences lp ON lp.course_id=e.course_id AND lp.student_id=e.student_id LEFT JOIN point_transactions pt ON pt.course_id=e.course_id AND pt.student_id=e.student_id WHERE e.course_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL AND COALESCE(lp.visibility,'private')!='private' GROUP BY s.id ORDER BY points DESC LIMIT 3`).bind(course.id).all<{label:string;points:number}>();
  const classLeaders = session ? await db.prepare(`SELECT lp.alias AS label,COALESCE(SUM(CASE WHEN COALESCE(pa.session_id,original_pa.session_id,pt.manual_session_id,original.manual_session_id)=? THEN pt.points ELSE 0 END),0) AS points FROM leaderboard_preferences lp JOIN enrolments e ON e.course_id=lp.course_id AND e.student_id=lp.student_id AND e.active=1 AND e.checked_in_at IS NOT NULL LEFT JOIN point_transactions pt ON pt.course_id=lp.course_id AND pt.student_id=lp.student_id LEFT JOIN point_awards pa ON pa.id=pt.award_id LEFT JOIN point_transactions original ON original.id=pt.reverses_transaction_id LEFT JOIN point_awards original_pa ON original_pa.id=original.award_id WHERE lp.course_id=? AND lp.visibility='public' AND lp.alias IS NOT NULL AND lp.alias!='' GROUP BY lp.student_id ORDER BY points DESC,lp.alias LIMIT 3`).bind(session.id,course.id).all<{label:string;points:number}>() : null;
  const present = session ? await db.prepare(`SELECT COUNT(*) AS n FROM attendance WHERE session_id=? AND voided_at IS NULL`).bind(session.id).first<{n:number}>() : null;
  const presentStudents = session ? await db.prepare(`SELECT s.student_number AS studentId,s.name,a.recorded_at AS checkedInAt,(SELECT COALESCE(SUM(pt.points),0) FROM point_transactions pt LEFT JOIN point_awards pa ON pa.id=pt.award_id LEFT JOIN point_transactions original ON original.id=pt.reverses_transaction_id LEFT JOIN point_awards original_pa ON original_pa.id=original.award_id WHERE pt.student_id=s.id AND COALESCE(pa.session_id,original_pa.session_id,pt.manual_session_id,original.manual_session_id)=?) AS classPoints,(SELECT COALESCE(SUM(pt.points),0) FROM point_transactions pt WHERE pt.student_id=s.id AND pt.course_id=?) AS totalPoints FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.session_id=? AND a.voided_at IS NULL ORDER BY a.recorded_at DESC,s.name`).bind(session.id, course.id, session.id).all<{studentId:string;name:string;checkedInAt:number;classPoints:number;totalPoints:number}>() : null;
  return {
    readOnly:!!user.readOnly, teacherAdmin:!!user.teacherAdmin,
    pilotOrigin: process.env.PILOT_MODE === 'true' ? (process.env.PILOT_PUBLIC_ORIGIN ?? null) : null,
    user: { id: user.userId, displayName: user.displayName, initials: initials(user.displayName) },
    course,
    courses: courses.results,
    availableTeachers,
    session: session ? { id: session.id, title: session.title, room: session.room, openedAt: session.openedAt, present: present?.n ?? 0, expiresAt:session.expiresAt, durationMinutes:session.durationMinutes } : null,
    presentStudents: (presentStudents?.results ?? []).map(row => ({ ...row, initials: initials(row.name) })),
    roster: roster.results,
    feed: feed.results.map(row => ({ ...row, initials: initials(row.name) })),
    leaders: leaders.results,
    classLeaders: classLeaders?.results??[],
  };
}

export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || '?'; }
export { now, id };

import { requireChatGPTUser } from '../chatgpt-auth';
import { env } from 'cloudflare:workers';
import { getTeacherAccounts } from '../teacher-actions';
import TeacherManager from './TeacherManager';
export const dynamic='force-dynamic';
export default async function TeachersPage(){
 const user=await requireChatGPTUser('/teachers');
 if(!user.teacherAdmin)return <main className="redeem-page"><section className="redeem-card"><h1>Teacher administration</h1><p>Only a teacher administrator can manage access.</p><a href="/">Return to dashboard</a></section></main>;
 const accounts=await getTeacherAccounts();
 const courses=(await env.DB.prepare("SELECT c.id,c.code,c.name FROM courses c JOIN course_teachers ct ON ct.course_id=c.id WHERE ct.teacher_id=? AND ct.role='owner' AND c.archived_at IS NULL ORDER BY c.name").bind(user.userId).all<{id:string;code:string;name:string}>()).results;
 return <TeacherManager accounts={accounts} courses={courses}/>;
}

import { env } from 'cloudflare:workers';
import PublicLeague from './PublicLeague';
import {publicRankingSql,type RankedNickname} from '../../public-ranking';
import {pointsDistribution} from '../../points-distribution';

export const dynamic='force-dynamic';

export default async function LeaguePage({params}:{params:Promise<{courseId:string}>}){
  const {courseId}=await params;
  const course=await env.DB.prepare(`SELECT id,code,name FROM courses WHERE id=? AND archived_at IS NULL`).bind(courseId).first<{id:string;code:string;name:string}>();
  if(!course)return <main className="league-page"><section className="league-empty"><div className="brand"><b>P</b>Pulse</div><h1>League not found</h1><p>This course league is not available.</p></section></main>;
  const scores=await env.DB.prepare(`SELECT COALESCE(SUM(pt.points),0) AS points FROM enrolments e LEFT JOIN point_transactions pt ON pt.course_id=e.course_id AND pt.student_id=e.student_id WHERE e.course_id=? AND e.active=1 GROUP BY e.student_id`).bind(course.id).all<{points:number}>();
  const ranking=await env.DB.prepare(publicRankingSql).bind(course.id).all<RankedNickname>();
  return <PublicLeague ranking={ranking.results.map(({nickname,points,rank})=>({nickname,points,rank}))} course={course} distribution={pointsDistribution(scores.results.map(row=>row.points))}/>;
}

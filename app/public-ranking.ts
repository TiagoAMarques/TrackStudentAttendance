export type RankedNickname={nickname:string;points:number;rank:number};
// Public rankings include only active, joined students who chose public aliases.
// Student IDs are used for aggregation but never selected into the response.
export const publicRankingSql=`WITH totals AS (
 SELECT lp.alias AS nickname,COALESCE(SUM(pt.points),0) AS points
 FROM enrolments e JOIN leaderboard_preferences lp ON lp.course_id=e.course_id AND lp.student_id=e.student_id
 LEFT JOIN point_transactions pt ON pt.course_id=e.course_id AND pt.student_id=e.student_id
 WHERE e.course_id=? AND e.active=1 AND e.checked_in_at IS NOT NULL
 AND lp.visibility='public' AND lp.alias IS NOT NULL AND trim(lp.alias)!=''
 GROUP BY e.student_id,lp.alias
), ranked AS (SELECT nickname,points,RANK() OVER (ORDER BY points DESC) AS rank FROM totals)
SELECT nickname,points,rank FROM ranked ORDER BY points DESC,nickname COLLATE NOCASE,nickname LIMIT 50`;

// Shared by signed-in redemption, pilot redemption, and nickname completion.
// Keep the same eligibility predicate inside the INSERT to avoid a check/write race.
export const eligiblePointAward = `
  SELECT pa.id,pa.points,pa.reason,pa.awarded_by AS recordedBy,
    COALESCE(pa.course_id,cs.course_id) AS courseId
  FROM point_awards pa
  LEFT JOIN class_sessions cs ON cs.id=pa.session_id
  JOIN courses c ON c.id=COALESCE(pa.course_id,cs.course_id) AND c.archived_at IS NULL
  JOIN enrolments e ON e.course_id=c.id AND e.student_id=?
    AND e.active=1 AND e.checked_in_at IS NOT NULL
  WHERE pa.token_digest=? AND pa.closed_at IS NULL
    AND (pa.expiry_mode='course' OR (
      (pa.session_id IS NULL OR (cs.id IS NOT NULL AND cs.closed_at IS NULL))
      AND ((pa.expiry_mode='session' AND cs.id IS NOT NULL)
        OR (pa.expiry_mode='timed' AND pa.expires_at>=?))
    ))
    AND (pa.restricted=0 OR EXISTS (
      SELECT 1 FROM point_award_recipients recipient
      WHERE recipient.award_id=pa.id AND recipient.student_id=e.student_id
    ))`;

export const claimPointAward = `
  INSERT INTO point_transactions
    (id,award_id,course_id,student_id,points,reason,recorded_by,source,identity_verification,created_at)
  SELECT ?,eligible.id,eligible.courseId,?,eligible.points,eligible.reason,?,'qr',?,?
  FROM (${eligiblePointAward}) eligible WHERE 1
  ON CONFLICT(award_id,student_id) DO NOTHING`;

export type EligiblePointAward = {id:string;points:number;reason:string;recordedBy:string;courseId:string};
export type AwardExpiryMode = 'timed'|'session'|'course';

export function validateAwardInput(input: {
  sessionId:string|null;points:number;reason:string;expiresSeconds:number;
  recipientStudentNumbers?:string[];
  expiryMode?:AwardExpiryMode;
}) {
  if(input.sessionId!==null&&(typeof input.sessionId!=='string'||!input.sessionId))throw Error('Choose a class or independent coursework.');
  if(!Number.isInteger(input.points)||input.points<1||input.points>100)throw Error('Enter a whole number of points from 1 to 100.');
  const expiryMode=input.expiryMode??'timed';
  if(!['timed','session','course'].includes(expiryMode))throw Error('Choose a valid expiry.');
  if(expiryMode==='session'&&!input.sessionId)throw Error('Choose a current class for an end-of-class expiry.');
  if(expiryMode==='timed'&&(!Number.isInteger(input.expiresSeconds)||input.expiresSeconds<60||input.expiresSeconds>1800))throw Error('Choose an expiry from 1 to 30 minutes.');
  if(typeof input.reason!=='string')throw Error('Enter a reason for this award.');
  const recipients=input.recipientStudentNumbers;
  if(recipients!==undefined&&(!Array.isArray(recipients)||!recipients.length||recipients.length>2000||recipients.some(n=>typeof n!=='string'||!n.trim())))throw Error('Select at least one eligible student.');
  return {
    ...input,
    expiryMode,
    reason:input.reason.trim().slice(0,160)||'Class participation',
    recipientStudentNumbers:recipients===undefined?undefined:[...new Set(recipients.map(n=>n.trim().toLowerCase()))],
  };
}

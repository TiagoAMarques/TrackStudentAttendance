export type RedemptionKind = 'onboarding'|'attendance'|'points';
export const redemptionLabels = {onboarding:'Course joining',attendance:'Class attendance',points:'Participation points'};
const prefixes = {onboarding:'JOIN',attendance:'ATT',points:'PTS'};

export function redemptionFailure(kind:RedemptionKind,code:string,explanation:string) {
  return {ok:false as const,message:`${redemptionLabels[kind]} [${prefixes[kind]}-${code}]: ${explanation}`};
}

// Explain a rejected request without changing eligibility or recording anything.
export async function diagnoseRedemptionFailure(db:D1Database,kind:RedemptionKind,digest:string,studentId:string,time:number) {
  type Qr={courseId:string;archivedAt:number|null;closedAt:number|null;expiresAt:number|null;sessionId:string|null;sessionClosedAt:number|null;expiryMode:string;restricted:number;id:string};
  const sql=kind==='onboarding'
    ?`SELECT c.id,c.id AS courseId,c.archived_at AS archivedAt FROM courses c WHERE ? IN (c.onboarding_token_digest,(SELECT token_digest FROM course_onboarding_qrs WHERE course_id=c.id))`
    :kind==='attendance'
    ?`SELECT cs.id,cs.course_id AS courseId,c.archived_at AS archivedAt,cs.closed_at AS closedAt,cs.attendance_expires_at AS expiresAt FROM class_sessions cs JOIN courses c ON c.id=cs.course_id WHERE cs.attendance_token_digest=?`
    :`SELECT pa.id,COALESCE(pa.course_id,cs.course_id) AS courseId,c.archived_at AS archivedAt,pa.closed_at AS closedAt,pa.expires_at AS expiresAt,pa.session_id AS sessionId,cs.closed_at AS sessionClosedAt,pa.expiry_mode AS expiryMode,pa.restricted FROM point_awards pa LEFT JOIN class_sessions cs ON cs.id=pa.session_id JOIN courses c ON c.id=COALESCE(pa.course_id,cs.course_id) WHERE pa.token_digest=?`;
  const qr=await db.prepare(sql).bind(digest).first<Qr>();
  if(!qr)return redemptionFailure(kind,'QR-UNKNOWN',`This ${kind==='onboarding'?'course-joining':kind==='attendance'?'attendance':'points'} QR is no longer recognised. Ask your teacher for the latest QR for this step.${kind==='attendance'?' To join the course, ask for the Course onboarding QR instead.':''}`);
  if(qr.archivedAt!==null)return redemptionFailure(kind,'COURSE-INACTIVE','This course has been archived. Contact your teacher.');
  const enrolment=await db.prepare('SELECT active,checked_in_at AS joinedAt FROM enrolments WHERE course_id=? AND student_id=?').bind(qr.courseId,studentId).first<{active:number;joinedAt:number|null}>();
  if(!enrolment?.active)return redemptionFailure(kind,'NOT-ENROLLED','Your number was found, but it is not on the active roster for the course linked to this QR. Ask your teacher to check your enrolment and the QR being shared.');
  if(kind!=='onboarding'&&enrolment.joinedAt===null)return redemptionFailure(kind,'JOIN-FIRST',`You have not finished joining this course. Scan the Course onboarding QR and choose your animal nickname first; no class needs to be open for that.${kind==='attendance'?' This QR records attendance for a class; it does not join the course.':''}`);
  if(kind==='attendance'){
    if(qr.closedAt!==null)return redemptionFailure(kind,'CLASS-CLOSED','This class session has ended. Ask your teacher for the attendance QR for an open class. If you only want to join the course, use the Course onboarding QR.');
    if(qr.expiresAt!==null&&qr.expiresAt<time)return redemptionFailure(kind,'QR-EXPIRED','This attendance QR has expired. Ask your teacher to display a fresh attendance QR.');
  }
  if(kind==='points'){
    if(qr.closedAt!==null)return redemptionFailure(kind,'QR-DEACTIVATED','Your teacher has deactivated this points QR. Ask your teacher whether a new award is available.');
    if(qr.expiryMode!=='course'&&qr.sessionId&&qr.sessionClosedAt!==null)return redemptionFailure(kind,'CLASS-CLOSED','The class linked to this points QR has ended. Ask your teacher for a new points QR.');
    if(qr.expiryMode==='timed'&&qr.expiresAt!==null&&qr.expiresAt<time)return redemptionFailure(kind,'QR-EXPIRED','This points QR has expired. Ask your teacher for a new points QR.');
    if(qr.restricted&&!await db.prepare('SELECT 1 AS allowed FROM point_award_recipients WHERE award_id=? AND student_id=?').bind(qr.id,studentId).first())return redemptionFailure(kind,'NOT-SELECTED','This points QR is restricted to selected students, and your student number is not selected. Ask your teacher to check the recipient list.');
  }
  return redemptionFailure(kind,'RETRY','The request could not be completed. Refresh the page and try again. If it persists, send your teacher this message.');
}

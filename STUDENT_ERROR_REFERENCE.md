# Pulse student error reference

Each student error states its step and includes a code. Ask students for the
**full message or a screenshot**. No QR link or token is needed for initial triage.

Prefixes: **JOIN** = join the course; **ATT** = class attendance; **PTS** = points.
These are diagnostic categories, not unique incident IDs. No student identity,
QR token, or other recipients' identities are embedded in the codes.

| Code suffix | Meaning / next step |
| --- | --- |
| NUMBER-REQUIRED | Enter the student number. |
| NUMBER-NOT-FOUND | Number not uniquely matched. Numeric and `fc` forms work; email addresses do not. Check for a typo or duplicate/import problem. |
| ACCOUNT-NOT-FOUND | Signed-in account cannot be matched to a roster record. |
| SIGN-IN | Authentication is required. |
| TOO-MANY-ATTEMPTS | Wait ten minutes before another attempt. |
| QR-UNKNOWN | Unknown QR for the indicated step. Joining QRs are permanent; share the course QR shown under Show joining QR. Codes replaced before the permanent-QR fix may be unknown. |
| COURSE-INACTIVE | Course is archived. |
| NOT-ENROLLED | Student exists, but is not on this QR's active course roster. |
| JOIN-FIRST | Attendance/points attempted before joining. Send Course onboarding QR; student must choose a nickname and finish joining. No class needs to be open for joining. |
| CLASS-CLOSED | Class linked to this QR has ended. Joining is a separate step. |
| QR-EXPIRED | Timed QR has expired; generate a fresh one. |
| QR-DEACTIVATED | Teacher stopped the points QR. |
| NOT-SELECTED | Student is not on this points QR's recipient list. |
| NICKNAME-REQUIRED | Select an animal nickname. |
| NICKNAME-UNAVAILABLE | Choose another nickname. |
| CONNECTION | Result could not be confirmed; refresh and retry. Duplicate points claims remain prevented. |
| NICKNAME-CONNECTION | Nickname save could not be confirmed; retry. |
| PILOT-DISABLED | Pilot flow is unavailable; check the intended authentication mode. |
| RETRY | State may have changed during the request; refresh, retry, and report if persistent. |

For example, **ATT-JOIN-FIRST** means the student is on an attendance page but
must complete course joining first. **JOIN-NOT-ENROLLED** means the student is
on the correct joining page but is not in that course's active roster.

When several conditions fail, the message prioritizes an unknown QR or inactive
course, then course enrolment/joining, then session/expiry/recipient conditions.
The message identifies a current blocker, not necessarily the only blocker.

Course joining QRs have no timer and are stored once per course. Reopening the QR never rotates it. The last valid pre-upgrade QR remains accepted; earlier overwritten tokens cannot be recovered from their hashes. Archived courses still reject joining with COURSE-INACTIVE.

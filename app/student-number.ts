// FCUL commonly displays numeric student numbers with an optional "fc" prefix.
// Only those two spellings are equivalent; do not infer identities from names.
export function studentNumberCandidates(input:string):string[] {
  const value=input.trim().toLowerCase();
  const match=/^(?:fc)?([0-9]+)$/.exec(value);
  return match?[match[1],`fc${match[1]}`]:[value];
}

export async function findPilotStudent(db:D1Database,input:string) {
  const candidates=studentNumberCandidates(input);
  const result=await db.prepare('SELECT id,name,student_number AS studentNumber FROM students WHERE lower(trim(student_number)) IN (?,?) LIMIT 2')
    .bind(candidates[0],candidates[1]??candidates[0]).all<{id:string;name:string;studentNumber:string}>();
  // Fail closed if legacy imports have both spellings as different records.
  return result.results.length===1?result.results[0]:null;
}

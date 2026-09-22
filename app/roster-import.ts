export type RosterStudent = { studentId:string; name:string; email:string; groups:string };
export type ImportStudent = RosterStudent & { status:'new'|'update'|'error'; issue?:string };

export function rosterCourseCode(filename:string):string {
  const match=/^courseid_(.+)_participants\.csv$/i.exec(filename);
  if(!match?.[1]?.trim())throw Error('Use a CSV named courseid_COURSEID_participants.csv, for example courseid_EN2026_participants.csv.');
  return match[1].trim();
}

export function validateRoster(input:RosterStudent[]):RosterStudent[]{
  if(!Array.isArray(input)||!input.length||input.length>2000)throw Error('Import between 1 and 2,000 students.');
  const seen=new Set<string>();
  return input.map((row,i)=>{
    if(!row||['studentId','name','email','groups'].some(k=>typeof row[k as keyof RosterStudent]!=='string'))throw Error(`Invalid student at row ${i+2}.`);
    const clean={studentId:row.studentId.trim().toLowerCase(),name:row.name.trim(),email:row.email.trim().toLowerCase(),groups:row.groups.trim()};
    const issue=studentIssue(clean,seen);
    if(issue)throw Error(`Row ${i+2}: ${issue}.`);
    return clean;
  });
}

function studentIssue(row:RosterStudent,seen:Set<string>):string{
  const key=row.studentId.toLowerCase();
  let issue='';
  if(!row.studentId)issue='Student ID is missing';
  else if(!row.name)issue='Name is missing';
  else if(seen.has(key))issue='Duplicate ID in file';
  else if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))issue='Invalid email';
  else if(row.studentId.length>100||row.name.length>300||row.email.length>320||row.groups.length>2000)issue='A field is too long';
  seen.add(key);return issue;
}

export function parseRoster(grid:unknown[][],filename:string,courseCode:string,existingIds:string[]=[]):ImportStudent[]{
  const code=rosterCourseCode(filename);
  if(code.toLowerCase()!==courseCode.toLowerCase())throw Error(`This file is for ${code}. Select that course before importing.`);
  const headers=(grid[0]??[]).map(v=>String(v??'').replace(/^\uFEFF/,'').trim().toLowerCase());
  const required=['first name','last name','id number','email address','groups'];
  if(required.some(h=>headers.filter(v=>v===h).length!==1))throw Error('The CSV must contain First name, Last name, ID number, Email address and Groups, each exactly once.');
  const indices=required.map(h=>headers.indexOf(h)),seen=new Set<string>(),existing=new Set(existingIds.map(v=>v.toLowerCase()));
  const data=grid.slice(1).filter(r=>r.some(v=>String(v??'').trim()));
  if(!data.length||data.length>2000)throw Error('Import between 1 and 2,000 students.');
  return data.map(r=>{
    const [first,last,studentId,email,groups]=indices.map(i=>String(r[i]??'').trim());
    const row={studentId,name:[first,last].filter(Boolean).join(' '),email,groups};
    const issue=studentIssue(row,seen);
    return {...row,status:issue?'error':existing.has(studentId.toLowerCase())?'update':'new',issue};
  });
}

export type AttendanceImportRow={classId:string;studentNumber:string};

export function validateAttendanceImport(input:AttendanceImportRow[],expectedClassId:string):AttendanceImportRow[]{
 if(!Array.isArray(input)||!input.length||input.length>500)throw Error('Import between 1 and 500 attendance rows.');
 const expected=expectedClassId.trim().toLowerCase(),seen=new Set<string>();
 return input.map((row,index)=>{
  if(!row||typeof row.classId!=='string'||typeof row.studentNumber!=='string')throw Error(`Row ${index+2}: Invalid attendance row.`);
  const clean={classId:row.classId.trim(),studentNumber:row.studentNumber.trim().toLowerCase()};
  if(!clean.classId)throw Error(`Row ${index+2}: Class ID is missing.`);
  if(clean.classId.toLowerCase()!==expected)throw Error(`Row ${index+2}: Class ID must be ${expectedClassId}.`);
  if(!clean.studentNumber)throw Error(`Row ${index+2}: ID number is missing.`);
  if(clean.classId.length>100||clean.studentNumber.length>100)throw Error(`Row ${index+2}: A field is too long.`);
  if(seen.has(clean.studentNumber))throw Error(`Row ${index+2}: Duplicate ID number in file.`);
  seen.add(clean.studentNumber);return clean;
 });
}

export function parseAttendanceImport(grid:unknown[][],expectedClassId:string):AttendanceImportRow[]{
 const headers=(grid[0]??[]).map(value=>String(value??'').replace(/^\uFEFF/,'').trim().toLowerCase());
 const required=['class id','id number'];
 if(required.some(header=>headers.filter(value=>value===header).length!==1))throw Error('The CSV must contain Class ID and ID number, each exactly once.');
 const indices=required.map(header=>headers.indexOf(header));
 const rows=grid.slice(1).filter(row=>row.some(value=>String(value??'').trim())).map(row=>({classId:String(row[indices[0]]??''),studentNumber:String(row[indices[1]]??'')}));
 return validateAttendanceImport(rows,expectedClassId);
}

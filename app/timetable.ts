export type TimetableRow = {courseId:string;classId:string;date:string;week:number;time:string;room:string;teacher:string;comments:string};
export type ScheduledClass = TimetableRow & {id:string;sessionId:string|null;closedAt:number|null};
const months:Record<string,number>={jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
function validDate(y:number,m:number,d:number){const v=new Date(Date.UTC(y,m-1,d));if(y<2000||y>2100||v.getUTCFullYear()!==y||v.getUTCMonth()!==m-1||v.getUTCDate()!==d)throw Error('Invalid date');return v.toISOString().slice(0,10)}
export function parseDate(value:unknown,date1904=false):string{
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Invalid date');const d=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(value)*86400000);return validDate(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())}
 const text=String(value??'').trim().toLowerCase();let m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return validDate(+m[1],+m[2],+m[3]);
 m=text.match(/^(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{4})$/);if(m)return validDate(+m[3],months[m[2]]??Number(m[2]),+m[1]);throw Error('Use an Excel date, dd/mm/yyyy or dd-mmm-yyyy');
}
export function parseTime(value:unknown):string{
 if(typeof value==='number'){if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid time');const n=Math.round(value*1440);if(n>=1440)throw Error('Invalid time');return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
 const m=String(value??'').trim().match(/^(\d{1,2}):(\d{2})(?::00)?$/);if(!m||+m[1]>23||+m[2]>59)throw Error('Use a time such as 10:30');return `${m[1].padStart(2,'0')}:${m[2]}`;
}
export function validateTimetable(rows:TimetableRow[],courseCode:string):TimetableRow[]{
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('Choose a file with 1–500 classes.');
 const seen=new Set<string>();
 return rows.map((row,i)=>{try{
  const clean={} as TimetableRow;
  for(const key of ['courseId','classId','room','teacher','comments'] as const){if(typeof row[key]!=='string')throw Error(`Invalid ${key}`);clean[key]=row[key].trim();if(clean[key].length>(key==='comments'?1000:100))throw Error(`${key} is too long`)}
  if(clean.courseId.toLowerCase()!==courseCode.trim().toLowerCase())throw Error(`Course ID must be ${courseCode}`);
  if(!clean.classId||!clean.room||!clean.teacher)throw Error('Class ID, Room and Docente are required');
  if(seen.has(clean.classId.toLowerCase()))throw Error('Duplicate Class ID in file');seen.add(clean.classId.toLowerCase());
  clean.date=parseDate(row.date);clean.time=parseTime(row.time);clean.week=Number(row.week);
  if(!Number.isInteger(clean.week)||clean.week<1||clean.week>53)throw Error('Week must be a whole number from 1 to 53');
  return clean;
 }catch(e){throw Error(`Row ${i+2}: ${e instanceof Error?e.message:'Invalid class'}`)}});
}
export function parseTimetable(grid:unknown[][],courseCode:string,date1904=false){
 const headers=['Course ID','Class ID','Date','Week','Time','Room','Docente','Comments'];
 const h=(grid[0]??[]).map(v=>String(v).trim().toLowerCase());const ix=headers.map(v=>h.indexOf(v.toLowerCase()));
 if(ix.some(i=>i<0))throw Error(`Required columns: ${headers.join(', ')}.`);
 return validateTimetable(grid.slice(1).filter(r=>r.some(v=>v!==null&&v!==undefined&&v!=='')).map((r,i)=>{
  try{return {courseId:String(r[ix[0]]??''),classId:String(r[ix[1]]??''),date:parseDate(r[ix[2]],date1904),week:Number(r[ix[3]]),time:parseTime(r[ix[4]]),room:String(r[ix[5]]??''),teacher:String(r[ix[6]]??''),comments:String(r[ix[7]]??'')}}catch(e){throw Error(`Row ${i+2}: ${e instanceof Error?e.message:'Invalid value'}`)}
 }),courseCode);
}

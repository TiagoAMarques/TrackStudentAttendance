export type SavedCourse={id:string;code:string;name:string};
const key='pulse.saved-courses.v1';
export function readCourses():SavedCourse[]{
  const rows:unknown=JSON.parse(localStorage.getItem(key)??'[]');
  if(!Array.isArray(rows))return [];
  return rows.filter((r):r is SavedCourse=>!!r&&typeof r==='object'&&typeof r.id==='string'&&/^[\w-]+$/.test(r.id)&&typeof r.code==='string'&&typeof r.name==='string').slice(0,30);
}
export function saveCourse(course:SavedCourse){
  const rows=readCourses().filter(row=>row.id!==course.id);
  if(rows.length>=30)throw Error('Remove a saved course before adding another.');
  localStorage.setItem(key,JSON.stringify([...rows,course]));
}
export function removeCourse(id:string){localStorage.setItem(key,JSON.stringify(readCourses().filter(row=>row.id!==id)))}

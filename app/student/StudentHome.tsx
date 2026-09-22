'use client';
import {useEffect,useState,type FormEvent} from 'react';
import InstallApp from './InstallApp';
import {readCourses,saveCourse,removeCourse,type SavedCourse} from './saved-courses';
export default function StudentHome(){
  const [courses,setCourses]=useState<SavedCourse[]>([]),[ready,setReady]=useState(false),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{const load=()=>{try{setCourses(readCourses())}catch{setError('Saved courses could not be read. Check that browser storage is allowed.')}setReady(true)};load();window.addEventListener('storage',load);return()=>window.removeEventListener('storage',load)},[]);
  async function add(event:FormEvent){
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try{
      const value=input.trim();let query=new URLSearchParams({code:value});
      if(value.includes('/')||value.includes(':')){
        const url=new URL(value,location.origin),match=url.pathname.match(/^\/league\/([\w-]+)\/?$/);
        if(url.origin!==location.origin||!match)throw Error('Use a course code or a Pulse course league link from your teacher.');
        query=new URLSearchParams({id:match[1]});
      }
      const response=await fetch('/student/course?'+query,{cache:'no-store'});
      if(!response.ok)throw Error(response.status===404?'Course not found. Check the code or league link with your teacher.':'Could not load the course. Check your connection and try again.');
      const course:SavedCourse=await response.json();
      saveCourse(course);setCourses(readCourses());setInput('');setMessage(course.code+' saved to My courses.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save this course. Please try again.')}finally{setBusy(false)}
  }
  return <main className="student-page"><header className="student-header"><a className="brand" href="/student"><b>P</b>Pulse</a><span>STUDENT LEAGUES</span></header><section className="student-intro"><p className="student-eyebrow">YOUR COURSES, ONE PLACE</p><h1>My courses</h1><p>See the distribution of participation points across your courses.</p></section>
    {!ready?<p>Loading saved courses…</p>:courses.length?<div className="student-courses">{courses.map(course=><article key={course.id}><span className="student-course-code">{course.code}</span><h2>{course.name}</h2><a className="student-open" href={'/league/'+encodeURIComponent(course.id)}>Open league <span>→</span></a><button className="student-remove" aria-label={'Remove '+course.code+' from this device'} onClick={()=>{try{removeCourse(course.id);setCourses(readCourses());setMessage(course.code+' removed from this device.')}catch{setError('Could not remove this saved course.')}}}>Remove from this device</button></article>)}</div>:<section className="student-empty"><h2>Your first course starts here</h2><p>Add a course below, or open your teacher’s course league link and tap “Save to My courses”. After joining through a QR, follow “View the course league”.</p></section>}
    <section className="student-add"><h2>Add a course</h2><form onSubmit={add}><label htmlFor="course-link">Course code or league link</label><div><input id="course-link" value={input} onChange={e=>setInput(e.target.value)} placeholder="e.g. EN2026" required maxLength={500} autoCapitalize="none" autoCorrect="off"/><button disabled={busy||!input.trim()}>{busy?'Adding…':'Add course'}</button></div></form><p className="student-help">Saving a course is a shortcut to its public league. To join the course, use your teacher’s joining QR.</p></section>
    {error&&<p className="student-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<InstallApp/><footer className="student-footer">Saved courses stay on this device and browser. League tables need an internet connection. Only grouped class scores are shown.<a href="/">Teacher sign-in</a></footer></main>;
}

'use client';
import {useEffect,useState} from 'react';
import {readCourses,saveCourse,type SavedCourse} from './saved-courses';
export default function SaveCourse({course}:{course:SavedCourse}){
  const [saved,setSaved]=useState(false),[error,setError]=useState('');
  useEffect(()=>{try{setSaved(readCourses().some(row=>row.id===course.id))}catch{}},[course.id]);
  return <div className="student-league-actions"><a href="/student">← My courses</a><button disabled={saved} onClick={()=>{try{saveCourse(course);setSaved(true);setError('')}catch{setError('Could not save this course. Allow browser storage and check your saved course list.')}}}>{saved?'Saved to My courses':'Save to My courses'}</button>{error&&<p role="alert">{error}</p>}</div>;
}

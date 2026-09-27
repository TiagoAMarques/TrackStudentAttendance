'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import { closeSession, getLiveClassroom, openSession, rotateAttendanceToken, switchCourse } from '../../actions';
import type { DashboardData } from '../../data';
import PointsAward from '../../PointsAward';

type View = 'overview'|'classes'|'league'|'actions';

export default function TeacherMobile({initial}:{initial:DashboardData}) {
  const [view,setView]=useState<View>('overview');
  const [present,setPresent]=useState(initial.session?.present??0);
  const [qr,setQr]=useState<{url:string;expiresAt:number}|null>(null);
  const [starting,setStarting]=useState(false),[title,setTitle]=useState(''),[room,setRoom]=useState(''),[minutes,setMinutes]=useState(30);
  const [error,setError]=useState(''),[pending,startTransition]=useTransition();
  const canvas=useRef<HTMLCanvasElement>(null);
  const rosterCount=initial.roster.length;
  const currentCourse=initial.courses.find(course=>course.id===initial.course.id);

  useEffect(()=>{
    if(!initial.session)return;
    let stopped=false;
    const refresh=()=>getLiveClassroom(initial.session!.id).then(rows=>{if(!stopped)setPresent(rows.length)}).catch(()=>{});
    void refresh();const timer=setInterval(refresh,15000);return()=>{stopped=true;clearInterval(timer)};
  },[initial.session]);
  useEffect(()=>{if(qr&&canvas.current)void QRCode.toCanvas(canvas.current,qr.url,{width:240,margin:2,color:{dark:'#052048',light:'#ffffff'}})},[qr]);
  const run=(work:()=>Promise<void>)=>startTransition(async()=>{setError('');try{await work()}catch(value){setError(value instanceof Error?value.message:'Something went wrong.')}});
  const showAttendanceQr=()=>run(async()=>{if(!initial.session)throw Error('Start a class first.');const result=await rotateAttendanceToken(initial.session.id);setQr({url:(initial.pilotOrigin??location.origin)+result.urlPath,expiresAt:result.expiresAt})});

  return <main className="teacher-mobile">
    <header className="teacher-mobile-header"><a className="brand" href="/student"><b>P</b>Pulse</a><div><small>TEACHER MODE</small><strong>{initial.user.displayName}</strong></div><a href="/pilot/logout" aria-label="Sign out">↪</a></header>
    <section className="teacher-mobile-course"><label>Current course<select value={initial.course.id} disabled={pending} onChange={event=>run(async()=>{await switchCourse(event.target.value);location.reload()})}>{initial.courses.map(course=><option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label></section>
    {initial.readOnly&&<p className="teacher-mobile-notice">Read-only teacher access: actions are disabled.</p>}
    {error&&<p className="student-error" role="alert">{error}</p>}

    {view==='overview'&&<section className="teacher-mobile-view">
      <div className={`teacher-live-card ${initial.session?'is-live':''}`}><small>{initial.session?'● LIVE NOW':'NO OPEN CLASS'}</small><h1>{initial.session?.title??initial.course.name}</h1>{initial.session?<><strong>{present}</strong><p>of {rosterCount} enrolled students currently recorded</p><div className="teacher-mobile-progress"><i style={{width:`${rosterCount?Math.min(100,present/rosterCount*100):0}%`}}/></div><div className="teacher-mobile-buttons"><button disabled={initial.readOnly||pending} onClick={showAttendanceQr}>Attendance QR</button><button disabled={initial.readOnly||pending} onClick={()=>setView('actions')}>Award points</button><button className="secondary" disabled={initial.readOnly||pending} onClick={()=>run(async()=>{await closeSession(initial.session!.id);location.reload()})}>Close class</button></div></>:<button disabled={initial.readOnly} onClick={()=>setStarting(true)}>Start a class</button>}</div>
      <div className="teacher-mobile-metrics"><article><strong>{currentCourse?.registered??rosterCount}</strong><span>enrolled</span></article><article><strong>{currentCourse?.joined??0}</strong><span>joined</span></article><article><strong>{initial.attendanceTrend.at(-1)?.present??0}</strong><span>last class</span></article></div>
      {starting&&<section className="teacher-mobile-panel"><h2>Start a class</h2><label>Class title<input value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Room<input value={room} onChange={event=>setRoom(event.target.value)}/></label><label>Attendance QR valid for<select value={minutes} onChange={event=>setMinutes(Number(event.target.value))}>{[5,10,20,30,60,120,240].map(value=><option value={value} key={value}>{value} minutes</option>)}</select></label><div className="teacher-mobile-buttons"><button disabled={pending||!title.trim()} onClick={()=>run(async()=>{const result=await openSession({title,room,attendanceMinutes:minutes});setQr({url:(initial.pilotOrigin??location.origin)+result.urlPath,expiresAt:result.expiresAt});setStarting(false)})}>Start and show QR</button><button className="secondary" onClick={()=>setStarting(false)}>Cancel</button></div></section>}
      {qr&&<QrPanel qr={qr} canvas={canvas} close={()=>setQr(null)}/>} 
    </section>}

    {view==='classes'&&<section className="teacher-mobile-view"><h1>Class attendance</h1><p>Distinct students recorded across every opening of the same Class ID.</p><div className="teacher-class-list">{initial.attendanceTrend.length?initial.attendanceTrend.slice().reverse().map(item=><article key={item.id}><div><strong>{item.classId}</strong><span>{item.date}</span></div><b>{item.present}<small>students</small></b></article>):<p>No completed class attendance is available yet.</p>}</div></section>}

    {view==='league'&&<section className="teacher-mobile-view"><h1>Course league</h1><p>Public animal nicknames and course point totals.</p><div className="teacher-mobile-league">{initial.leaders.map((row,index)=><article key={row.label}><i>{index+1}</i><strong>{row.label}</strong><b>{row.points}<small>points</small></b></article>)}</div><a className="teacher-mobile-link" href={`/league/${initial.course.id}`}>Open the full course league →</a></section>}

    {view==='actions'&&<section className="teacher-mobile-view"><PointsAward data={initial} initialPoints={1}/></section>}

    <nav className="teacher-mobile-nav" aria-label="Teacher mode"><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}><span>⌂</span>Live</button><button className={view==='classes'?'active':''} onClick={()=>setView('classes')}><span>✓</span>Classes</button><button className={view==='league'?'active':''} onClick={()=>setView('league')}><span>♛</span>League</button><button className={view==='actions'?'active':''} disabled={initial.readOnly} onClick={()=>setView('actions')}><span>＋</span>Award</button></nav>
  </main>;
}

function QrPanel({qr,canvas,close}:{qr:{url:string;expiresAt:number};canvas:React.RefObject<HTMLCanvasElement|null>;close:()=>void}){
 const [remaining,setRemaining]=useState(0);useEffect(()=>{const tick=()=>setRemaining(Math.max(0,qr.expiresAt-Math.floor(Date.now()/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[qr.expiresAt]);
 return <section className="teacher-mobile-qr" role="dialog" aria-label="Attendance QR"><small>ATTENDANCE QR</small><h2>Students scan to check in</h2><canvas ref={canvas}/><strong>{remaining?`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`:'QR expired'}</strong><button onClick={close}>Close</button></section>;
}

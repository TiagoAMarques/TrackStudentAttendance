'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import { awardPointsDirectly, createAward, closePointAward } from './actions';
import type { DashboardData } from './data';

let nextMode: 'qr'|'direct' = 'qr';

export function setNextPointsAwardMode(mode:'qr'|'direct') {
  nextMode=mode;
}

export default function PointsAward({data,initialPoints}:{data:DashboardData;initialPoints:number}) {
  const [mode,setMode]=useState<'qr'|'direct'>(nextMode);
  const [sessionId,setSessionId]=useState(data.session?.id??'');
  const [points,setPoints]=useState(initialPoints);
  const [reason,setReason]=useState('');
  const [expires,setExpires]=useState('300');
  const [restricted,setRestricted]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');
  const [pending,startTransition]=useTransition();
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [directResult,setDirectResult]=useState<{count:number;points:number}|null>(null);
  const [result,setResult]=useState<{url:string;expiresAt:number|null;expiryMode:'timed'|'session'|'course';awardId:string;closed?:boolean;points:number;scope:string;audience:string}|null>(null);
  const [remaining,setRemaining]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null);
  const joined=data.roster.filter(student=>student.checkedInAt!==null);
  const eligible=mode==='direct'?data.roster:joined;
  const filtered=eligible.filter(student=>`${student.name} ${student.studentId}`.toLowerCase().includes(search.toLowerCase().trim()));

  useEffect(()=>{
    if(!result||result.closed)return;
    if(canvas.current)void QRCode.toCanvas(canvas.current,result.url,{width:220,margin:2,color:{dark:'#052048',light:'#ffffff'}}).catch(()=>setError('Could not draw the QR code. Please generate another code.'));
    if(result.expiresAt===null)return;
    const tick=()=>setRemaining(Math.max(0,result.expiresAt!-Math.floor(Date.now()/1000)));
    tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
  },[result]);

  function generate(){
    setError('');setResult(null);
    startTransition(async()=>{
      try{
        const expiryMode=expires==='session'||expires==='course'?expires:'timed';
        const award=await createAward({sessionId:sessionId||null,points,reason:reason||(sessionId?'Class participation':'Independent coursework'),expiresSeconds:expiryMode==='timed'?Number(expires):300,expiryMode,...(restricted?{recipientStudentNumbers:selected}:{})});
        setResult({url:(data.pilotOrigin??location.origin)+award.urlPath,expiresAt:award.expiresAt,expiryMode:award.expiryMode,awardId:award.awardId,points,scope:sessionId?data.session!.title:'Independent coursework',audience:restricted?selected.map(number=>joined.find(student=>student.studentId===number)?.name??number).join(', '):'All joined students'});
      }catch(value){setError(value instanceof Error?value.message:'Could not create the points QR. Please try again.');}
    });
  }

  function awardDirect(){
    setError('');
    startTransition(async()=>{
      try{
        const award=await awardPointsDirectly({studentNumbers:selected,points,reason:reason||'Coursework submitted outside class',sessionId:sessionId||null,requestId});
        setDirectResult({count:award.created,points});
      }catch(value){setError(value instanceof Error?value.message:'Could not award these points. Please try again.');}
    });
  }

  if(directResult)return <div className="points-award award-success"><small>TEACHER DIRECT AWARD · {data.course.code}</small><h2>Points awarded</h2><p><strong>{directResult.count} {directResult.count===1?'student':'students'}</strong> received {directResult.points} {directResult.points===1?'point':'points'} each. Course records identify the source and the awarding teacher.</p><button className="dark" onClick={()=>{setDirectResult(null);setSelected([]);setRequestId(crypto.randomUUID())}}>Award more points</button></div>;

  if(result)return <div className="points-award">
    <small>POINTS QR · {data.course.code}</small><h2>Scan to claim {result.points} points</h2>
    <p><strong>{result.scope}</strong></p><p className="award-audience">Available to: {result.audience}</p>
    {!result.closed&&<div className="award-qr"><canvas ref={canvas} aria-label="Points award QR code"/></div>}
    <p className={`qr-countdown ${result.closed||(result.expiryMode==='timed'&&remaining===0)?'expired':''}`} role="status">{result.closed?'QR deactivated':result.expiryMode==='session'?'Valid until the teacher closes this class':result.expiryMode==='course'?'No time limit while this course is active':remaining?`Expires in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'QR expired — generate another code'}</p>
    {error&&<p className="course-error" role="alert">{error}</p>}
    <p>One claim per eligible student. Students must have joined this course.</p>
    {!result.closed&&<button className="import-button" disabled={pending} onClick={()=>{setError('');startTransition(async()=>{try{await closePointAward(result.awardId);setResult({...result,closed:true})}catch(value){setError(value instanceof Error?value.message:'Could not deactivate QR.')}})}}>{pending?'Deactivating…':'Deactivate this QR'}</button>}
    <button className="dark" onClick={()=>{setResult(null);setError('')}}>Create another award</button>
  </div>;

  return <div className="points-award">
    <small>PARTICIPATION AWARD · {data.course.code}</small><h2>Award points</h2>
    <div className="manual-kind award-mode"><button className={mode==='qr'?'active':''} onClick={()=>{setMode('qr');setSelected([]);setError('')}}>QR code</button><button className={mode==='direct'?'active':''} onClick={()=>{setMode('direct');setSelected([]);setError('')}}>Award directly</button></div>
    <fieldset disabled={pending} className="award-fields">
      <label className="field">Count points toward<select value={sessionId} onChange={event=>{setSessionId(event.target.value);if(!event.target.value&&expires==='session')setExpires('300')}}><option value="">Independent coursework (no class)</option>{data.session&&<option value={data.session.id}>Current class · {data.session.title}</option>}</select></label>
      <p>{sessionId?'Counts toward this class and the course total.':'Counts toward the course total only. No class session is needed.'} {mode==='direct'?'Students do not need to scan or have joined the course app.':''}</p>
      <div className="points">{[1,2,3,5].map(value=><button type="button" aria-pressed={points===value} className={points===value?'selected':''} onClick={()=>setPoints(value)} key={value}>+{value}</button>)}</div>
      <label className="field">Points<input type="number" min="1" max="100" step="1" value={Number.isFinite(points)?points:''} onChange={event=>setPoints(event.target.value===''?NaN:Number(event.target.value))}/></label>
      <label className="field">Reason<input value={reason} maxLength={160} placeholder={mode==='direct'?'Coursework submitted outside class':sessionId?'Class participation':'Independent coursework'} onChange={event=>setReason(event.target.value)}/></label>
      {mode==='qr'&&<label className="field">Who can claim this QR?<select value={restricted?'selected':'all'} onChange={event=>setRestricted(event.target.value==='selected')}><option value="all">All joined students</option><option value="selected">Selected students only</option></select></label>}
      {(mode==='direct'||restricted)&&<StudentPicker students={filtered} total={eligible.length} selected={selected} search={search} direct={mode==='direct'} setSearch={setSearch} setSelected={setSelected}/>}
      {mode==='qr'&&<><label className="field">QR validity<select value={expires} onChange={event=>setExpires(event.target.value)}><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="1800">30 minutes</option>{sessionId&&<option value="session">Until this class is closed</option>}<option value="course">No time limit while course is active</option></select></label><p>{expires==='course'?'Remains valid after a class ends. You can deactivate it here or in course records.':expires==='session'?'Ends when a teacher closes this class session.':sessionId?'Ends after the selected time or when this class is closed, whichever comes first.':'Ends after the selected time.'}</p></>}
    </fieldset>
    {error&&<p className="course-error" role="alert">{error}</p>}
    <button className="dark create" disabled={pending||!Number.isInteger(points)||points<1||points>100||((mode==='direct'||restricted)&&!selected.length)} onClick={mode==='direct'?awardDirect:generate}>{pending?(mode==='direct'?'Awarding…':'Creating QR…'):(mode==='direct'?`Award ${points} points to ${selected.length} ${selected.length===1?'student':'students'}`:'Create points QR')}</button>
  </div>;
}

function StudentPicker({students,total,selected,search,direct,setSearch,setSelected}:{students:DashboardData['roster'];total:number;selected:string[];search:string;direct:boolean;setSearch:(value:string)=>void;setSelected:React.Dispatch<React.SetStateAction<string[]>>}){
  return <div className="award-recipients"><label className="field">Find students<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name or student number"/></label><p aria-live="polite">{selected.length} selected · {total} eligible students</p><div className="award-student-list">{students.map(student=><label key={student.studentId}><input type="checkbox" checked={selected.includes(student.studentId)} onChange={event=>setSelected(current=>event.target.checked?[...current,student.studentId]:current.filter(number=>number!==student.studentId))}/><span>{student.name}<small>{student.studentId}</small></span></label>)}{!students.length&&<p>{total?'No students match your search.':direct?'Import students before awarding points.':'Students must join the course before they can receive points.'}</p>}</div>{selected.length>0&&<button type="button" className="link" onClick={()=>setSelected([])}>Clear selection</button>}<p>{direct?'The selected students receive the points as soon as you confirm. The audit record names the awarding teacher.':'Only the selected student numbers can claim this QR. Pilot identities are not verified.'}</p></div>;
}

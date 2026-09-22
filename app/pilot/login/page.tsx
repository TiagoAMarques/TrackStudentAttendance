'use client';

import { FormEvent, useState, useTransition } from 'react';
import { pilotLogin } from '../../pilot-auth';

export default function PilotLogin(){const[code,setCode]=useState(''),[error,setError]=useState('');const[pending,startTransition]=useTransition();function submit(e:FormEvent){e.preventDefault();startTransition(async()=>{try{const result=await pilotLogin(code);if(result.ok)location.href='/';else setError(result.message)}catch{setError('Teacher access is temporarily unavailable. Please try again.')}})}return <main className="redeem-page"><section className="redeem-card"><div className="brand"><b>P</b>Pulse</div><div className="pilot-badge">TEACHER PILOT</div><h1>Teacher access</h1><p>Enter your teacher access code. Shared test accounts open the same dashboard with read-only access.</p><form onSubmit={submit}><label className="field">Access code<input type="password" autoFocus value={code} onChange={e=>setCode(e.target.value)} required/></label>{error&&<div className="import-error">{error}</div>}<button className="dark create" disabled={pending}>{pending?'Checking…':'Open teacher dashboard'}</button></form></section></main>}

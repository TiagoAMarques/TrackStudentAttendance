'use client';
import {useState,useTransition} from 'react';
import {redeem} from './actions';
export default function SignedRedeem({kind,token}:{kind:'attendance'|'points';token:string}){
 const [result,setResult]=useState<{ok:boolean;message:string}|null>(null),[pending,startTransition]=useTransition();
 return <main className="redeem-page"><section className="redeem-card"><div className="brand"><b>P</b>Pulse</div><h1>{kind==='attendance'?'Confirm attendance':'Claim participation points'}</h1>{result?<p role="status">{result.message}</p>:<p>Confirm to submit this QR using your signed-in identity.</p>}<button className="dark create" disabled={pending||result?.ok} onClick={()=>startTransition(async()=>{try{setResult(await redeem(kind,token))}catch{setResult({ok:false,message:'Could not confirm the result. You can retry safely.'})}})}>{pending?'Confirming…':'Confirm'}</button></section></main>;
}

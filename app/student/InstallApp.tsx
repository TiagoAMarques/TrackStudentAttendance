'use client';
import {useEffect,useState} from 'react';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function InstallApp(){
  const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)');
    setInstalled(standalone.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);
    const ready=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent)};
    const done=()=>{setInstalled(true);setPrompt(null)};
    window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done);
    if('serviceWorker' in navigator)void navigator.serviceWorker.register('/student-sw.js',{scope:'/'}).catch(()=>{});
    return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done)};
  },[]);
  if(installed)return null;
  return <section className="student-install"><h2>Keep Pulse on your phone</h2><p>Open your saved course leagues from your home screen.</p>{prompt?<button onClick={async()=>{try{await prompt.prompt();await prompt.userChoice;setPrompt(null)}catch{setMessage('Use your browser menu to install Pulse.')}}}>Install Pulse</button>:<p className="student-help">Android: open this page in Chrome, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong> from the menu. iPhone: open in Safari, tap Share, then <strong>Add to Home Screen</strong>.</p>}{message&&<p role="status">{message}</p>}</section>;
}

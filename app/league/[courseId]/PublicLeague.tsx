'use client';
import {useEffect} from 'react';
import NicknameRanking from './NicknameRanking';
import type {RankedNickname} from '../../public-ranking';
import {useRouter} from 'next/navigation';
import SaveCourse from '../../student/SaveCourse';
import InstallApp from '../../student/InstallApp';
import type {PointsDistribution} from '../../points-distribution';
export default function PublicLeague({course,distribution,ranking}:{ranking:RankedNickname[];course:{id:string;code:string;name:string};distribution:PointsDistribution}){
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)router.refresh()},60000);return()=>clearInterval(timer)},[router]);
  const max=Math.max(1,...distribution.bins.map(bin=>bin.count));
  return <main className="league-page"><section className="league-shell"><header><div className="brand"><b>P</b>Pulse</div><span>CLASS POINTS & LEAGUE</span></header><SaveCourse course={course}/><div className="league-hero"><small>{course.code} · COURSE TOTALS</small><h1>{course.name}</h1><p>Explore the class points distribution and the public nickname league. Student names, numbers and email addresses are not displayed.</p></div><section className="distribution-board"><h2>How are points distributed?</h2><p>All currently enrolled students are included, including those with zero points.</p>{distribution.available?<><div className="distribution-chart" role="img" aria-label={distribution.bins.map(bin=>`${bin.from===bin.to?bin.from:`${bin.from} to ${bin.to}`} points: ${bin.count} students`).join('. ')}>{distribution.bins.map(bin=><div className="distribution-row" key={bin.from}><span>{bin.from===bin.to?bin.from:`${bin.from}–${bin.to}`}<small>{bin.from===1&&bin.to===1?'point':'points'}</small></span><div className="distribution-track"><div style={{width:`${bin.count/max*100}%`}}/></div><strong>{bin.count}<small>students</small></strong></div>)}</div><p className="distribution-note">{distribution.bins.every(bin=>bin.from===bin.to)?'Each bar counts students with that exact score.':'Each bar counts students in an equal-width points range, sized for the score range and class size.'} Empty categories and zero scores are included.</p></>:<div className="distribution-unavailable"><h3>The distribution is not available yet</h3><p>There are no valid enrolled-student scores to display yet.</p></div>}<p className="distribution-note">Personal score comparisons will be available after secure student sign-in is introduced.</p></section><NicknameRanking rows={ranking}/><InstallApp/><footer>The distribution includes all enrolled students. The league shows only public nicknames and point totals.</footer></section></main>;
}

import { isPilotMode, requireChatGPTUser } from '../../../chatgpt-auth';
import SignedRedeem from '../../../SignedRedeem';
import PilotRedeem from '../../../PilotRedeem';

export const dynamic = 'force-dynamic';

export default async function RedeemPage({ params }: { params: Promise<{kind:string;token:string}> }) {
  const { kind, token } = await params;
  if (isPilotMode()) {
    if(process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS!=='true')return <Result ok={false} message="Unverified student access is disabled. Student sign-in must be configured before QR submissions can be accepted. Your teacher can record attendance and points manually."/>;
    return kind === 'attendance' || kind === 'points' || kind === 'onboarding'
      ? <PilotRedeem kind={kind} token={token} />
      : <Result ok={false} message="This QR code is not valid." />;
  }
  await requireChatGPTUser(`/redeem/${encodeURIComponent(kind)}/${encodeURIComponent(token)}`);
  return kind==='attendance'||kind==='points'?<SignedRedeem kind={kind} token={token}/>:<Result ok={false} message="Contact your teacher to complete course enrolment."/>;
}

function Result({ok,message}:{ok:boolean;message:string}) { return <main className="redeem-page"><section className={`redeem-card ${ok?'success':'failure'}`}><div className="brand"><b>P</b>Pulse</div><i>{ok?'✓':'!'}</i><h1>{ok?'All done':'Could not redeem'}</h1><p>{message}</p><a href="/">Return to Pulse</a></section></main> }

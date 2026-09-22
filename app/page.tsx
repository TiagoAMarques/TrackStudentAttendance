import { requireChatGPTUser } from './chatgpt-auth';
import { getDashboard } from './data';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <Dashboard initial={await getDashboard(user)} />;
}

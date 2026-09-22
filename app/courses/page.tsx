import { requireChatGPTUser } from '../chatgpt-auth';
import { getDashboard } from '../data';
import CoursesOverview from './CoursesOverview';

export const dynamic='force-dynamic';

export default async function CoursesPage(){
  const user=await requireChatGPTUser('/courses');
  return <CoursesOverview data={await getDashboard(user)}/>;
}

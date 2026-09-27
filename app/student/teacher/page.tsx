import { requireChatGPTUser } from '../../chatgpt-auth';
import { getDashboard } from '../../data';
import TeacherMobile from './TeacherMobile';

export const dynamic = 'force-dynamic';

export default async function TeacherMobilePage() {
  const user = await requireChatGPTUser('/student/teacher');
  return <TeacherMobile initial={await getDashboard(user)} />;
}

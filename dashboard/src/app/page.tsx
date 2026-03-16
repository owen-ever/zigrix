import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/DashboardClient';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth';
import { createZigrixStore } from '@/lib/zigrix-store';

export const dynamic = 'force-dynamic';

const store = createZigrixStore();

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    redirect('/login');
  }

  const overview = store.loadOverview();
  const selectedTaskId = overview.taskHistory[0]?.taskId || null;
  const detail = selectedTaskId ? store.loadTaskDetail(selectedTaskId) : null;
  const conversation = selectedTaskId ? await store.loadTaskConversation(selectedTaskId) : null;

  return (
    <DashboardClient
      initialOverview={overview}
      initialSelectedTaskId={selectedTaskId}
      initialTaskDetail={detail}
      initialConversation={conversation}
    />
  );
}

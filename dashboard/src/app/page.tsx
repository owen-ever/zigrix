import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/DashboardClient';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth';
import { createZigrixStore } from '@/lib/zigrix-store';
import { resolveZigrixVersion } from '@/lib/zigrix-version';

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
  const zigrixVersion = resolveZigrixVersion();

  return (
    <DashboardClient
      initialOverview={overview}
      initialSelectedTaskId={null}
      initialTaskDetail={null}
      initialConversation={null}
      zigrixVersion={zigrixVersion}
    />
  );
}

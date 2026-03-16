import { NextRequest, NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';

export const runtime = 'nodejs';

const store = createZigrixStore();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await params;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  try {
    const result = await store.cancelTask(taskId);
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };

    if (err.code === 'task_not_cancellable') {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    console.error(`[cancel] Failed to cancel task ${taskId}:`, error);
    return NextResponse.json(
      { error: 'Failed to cancel task' },
      { status: 500 },
    );
  }
}

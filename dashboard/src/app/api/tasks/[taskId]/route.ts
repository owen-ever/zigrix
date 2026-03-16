import { NextRequest, NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const store = createZigrixStore();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await params;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  try {
    const detail = store.loadTaskDetail(taskId);
    return NextResponse.json(detail);
  } catch (error) {
    console.error(`[task-detail] Failed to load task ${taskId}:`, error);
    return NextResponse.json(
      { error: 'Failed to load task detail' },
      { status: 500 },
    );
  }
}

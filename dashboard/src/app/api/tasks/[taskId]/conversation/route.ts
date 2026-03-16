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
    const conversation = await store.loadTaskConversation(taskId);
    return NextResponse.json(conversation);
  } catch (error) {
    console.error(`[conversation] Failed to load conversation for task ${taskId}:`, error);
    return NextResponse.json(
      { error: 'Failed to load conversation data' },
      { status: 500 },
    );
  }
}

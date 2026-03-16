import { NextRequest, NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';

const store = createZigrixStore();

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['POST', 'OPTIONS']);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  const { taskId } = await params;

  if (!taskId) {
    return applyCors(request, NextResponse.json({ error: 'taskId is required' }, { status: 400 }));
  }

  try {
    const result = await store.cancelTask(taskId);
    return applyCors(request, NextResponse.json(result));
  } catch (error) {
    const err = error as Error & { code?: string };

    if (err.code === 'task_not_cancellable') {
      return applyCors(
        request,
        NextResponse.json({ error: 'Task cannot be cancelled in its current state' }, { status: 409 }),
      );
    }

    console.error(`[cancel] Failed to cancel task ${taskId}:`, error);
    return applyCors(request, NextResponse.json({ error: 'Failed to cancel task' }, { status: 500 }));
  }
}

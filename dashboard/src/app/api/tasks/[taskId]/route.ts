import { NextRequest, NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const store = createZigrixStore();

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['GET', 'OPTIONS']);
}

export async function GET(
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
    const detail = store.loadTaskDetail(taskId);
    return applyCors(request, NextResponse.json(detail));
  } catch (error) {
    console.error(`[task-detail] Failed to load task ${taskId}:`, error);
    return applyCors(request, NextResponse.json({ error: 'Failed to load task detail' }, { status: 500 }));
  }
}

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
    const conversation = await store.loadTaskConversation(taskId);
    return applyCors(request, NextResponse.json(conversation));
  } catch (error) {
    console.error(`[conversation] Failed to load conversation for task ${taskId}:`, error);
    return applyCors(
      request,
      NextResponse.json({ error: 'Failed to load conversation data' }, { status: 500 }),
    );
  }
}

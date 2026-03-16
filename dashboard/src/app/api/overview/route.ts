import { NextRequest, NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const store = createZigrixStore();

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['GET', 'OPTIONS']);
}

export async function GET(request: NextRequest): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  try {
    const overview = store.loadOverview();
    return applyCors(request, NextResponse.json(overview));
  } catch (error) {
    console.error('[overview] Failed to load overview:', error);
    return applyCors(request, NextResponse.json({ error: 'Failed to load overview data' }, { status: 500 }));
  }
}

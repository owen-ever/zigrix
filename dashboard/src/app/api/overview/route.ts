import { NextResponse } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const store = createZigrixStore();

export async function GET(): Promise<NextResponse> {
  try {
    const overview = store.loadOverview();
    return NextResponse.json(overview);
  } catch (error) {
    console.error('[overview] Failed to load overview:', error);
    return NextResponse.json(
      { error: 'Failed to load overview data' },
      { status: 500 },
    );
  }
}

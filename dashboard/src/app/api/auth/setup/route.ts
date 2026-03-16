import { NextRequest, NextResponse } from 'next/server';
import { isSetupRequired, setupAdmin } from '@/lib/auth';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['GET', 'POST', 'OPTIONS']);
}

export async function GET(request: NextRequest): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  if (!isSetupRequired()) {
    return applyCors(request, NextResponse.json({ error: 'Not found' }, { status: 404 }));
  }

  return applyCors(request, NextResponse.json({ setupRequired: true }));
}

export async function POST(request: NextRequest): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  if (!isSetupRequired()) {
    return applyCors(request, NextResponse.json({ error: 'Not found' }, { status: 404 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return applyCors(request, NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return applyCors(request, NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }

  const { username, password } = body as Record<string, unknown>;

  if (typeof username !== 'string' || !username.trim()) {
    return applyCors(request, NextResponse.json({ error: 'username is required' }, { status: 400 }));
  }

  if (typeof password !== 'string' || password.length < 8) {
    return applyCors(
      request,
      NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 }),
    );
  }

  try {
    await setupAdmin(username.trim(), password);
    return applyCors(request, NextResponse.json({ ok: true }));
  } catch (error) {
    console.error('[setup] Failed to create admin:', error);
    return applyCors(
      request,
      NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 }),
    );
  }
}

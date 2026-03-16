import { NextRequest, NextResponse } from 'next/server';
import { isSetupRequired, setupAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const required = isSetupRequired();
  return NextResponse.json({ setupRequired: required });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Setup is only allowed when no admin exists
  if (!isSetupRequired()) {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { username, password } = body as Record<string, unknown>;

  if (typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'username is required' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  try {
    await setupAdmin(username.trim(), password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[setup] Failed to create admin:', error);
    return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
  }
}

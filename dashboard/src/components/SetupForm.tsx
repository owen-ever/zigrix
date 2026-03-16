'use client';

import { useState } from 'react';
import styles from './AuthForm.module.css';

export function SetupForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const setupResponse = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const setupPayload = (await setupResponse.json().catch(() => ({}))) as { error?: string };
      if (!setupResponse.ok) {
        throw new Error(setupPayload.error || 'Setup 실패');
      }

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const loginPayload = (await loginResponse.json().catch(() => ({}))) as { error?: string };
      if (!loginResponse.ok) {
        throw new Error(loginPayload.error || '자동 로그인 실패');
      }

      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message || 'Setup 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Zigrix Setup</h1>
        <p className={styles.desc}>최초 관리자 계정을 생성합니다.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            Password (min 8)
            <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <label>
            Password 확인
            <input type="password" minLength={8} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
          </label>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? '생성 중...' : '관리자 계정 생성'}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

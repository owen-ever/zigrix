'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './AuthForm.module.css';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetupLink, setShowSetupLink] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setShowSetupLink(false);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        if (response.status === 403 && payload.error === 'Setup required') {
          setShowSetupLink(true);
        }
        throw new Error(payload.error || '로그인 실패');
      }

      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message || '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Zigrix Login</h1>
        <p className={styles.desc}>관리자 계정으로 로그인하세요.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {showSetupLink ? (
          <Link href="/setup" className={styles.link}>
            최초 설정으로 이동 (/setup)
          </Link>
        ) : null}
      </section>
    </main>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  value?: string | null;
};

function formatRelative(value?: string | null): string {
  if (!value) return '-';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return value;

  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 5) return '방금 전';
  if (diffSec < 60) return `${diffSec}초 전`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;

  return new Date(value).toLocaleString('ko-KR');
}

export function RelativeTime({ value }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const text = useMemo(() => formatRelative(value), [value, tick]);
  return <span title={value || ''}>{text}</span>;
}

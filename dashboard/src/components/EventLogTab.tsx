'use client';

import { useEffect, useRef } from 'react';
import type { ZigrixOverviewData } from '@/types/dashboard';
import styles from './EventLogTab.module.css';

type Props = {
  events: ZigrixOverviewData['recentEvents'];
};

function formatTs(ts?: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString('ko-KR');
}

export function EventLogTab({ events }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = 0;
  }, [events.length]);

  return (
    <div ref={listRef} className={styles.wrap}>
      {events.length === 0 ? (
        <p className={styles.empty}>이벤트가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event, idx) => {
            const name = event.event || 'unknown';
            return (
              <li key={`${event.ts || 'no-ts'}-${name}-${idx}`} className={styles.item}>
                <span className={styles.ts}>[{formatTs(event.ts)}]</span>{' '}
                <span className={styles.name}>{name}</span>{' | '}
                <span>task={event.taskId || '-'}</span>{' | '}
                <span>status={event.status || '-'}</span>{' | '}
                {name === 'worker_dispatched' ? (
                  <strong>{event.actor || event.agentId || '-'} → {event.targetAgent || '-'}</strong>
                ) : (
                  <span>actor={event.actor || event.agentId || '-'}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

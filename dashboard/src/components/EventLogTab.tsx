'use client';

import { useEffect, useRef } from 'react';
import type { ZigrixEventRow } from '@/types/dashboard';
import styles from './EventLogTab.module.css';

type Props = {
  selectedTaskId: string | null;
  events: ZigrixEventRow[];
  loading: boolean;
};

function formatTs(ts?: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString('ko-KR');
}

function asText(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : '-';
}

export function EventLogTab({ selectedTaskId, events, loading }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = 0;
  }, [events.length, selectedTaskId]);

  return (
    <div ref={listRef} className={styles.wrap}>
      {!selectedTaskId ? (
        <p className={styles.empty}>태스크를 선택해 주세요.</p>
      ) : loading ? (
        <p className={styles.empty}>이벤트를 불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className={styles.empty}>이벤트가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event, idx) => {
            const name = asText(event.event ?? event.action ?? 'unknown');
            const taskId = asText(event.taskId);
            const status = asText(event.status);
            const actor = asText(event.actor ?? event.agentId);
            const targetAgent = asText(event.targetAgent);

            return (
              <li key={`${event.ts || 'no-ts'}-${name}-${idx}`} className={styles.item}>
                <span className={styles.ts}>[{formatTs(event.ts)}]</span>{' '}
                <span className={styles.name}>{name}</span>{' | '}
                <span>task={taskId}</span>{' | '}
                <span>status={status}</span>{' | '}
                {name === 'worker_dispatched' ? (
                  <strong>{actor} → {targetAgent}</strong>
                ) : (
                  <span>actor={actor}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

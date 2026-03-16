'use client';

import { useMemo, useState } from 'react';
import type { TaskListItem } from '@/types/dashboard';
import { StatusBadge } from './StatusBadge';
import { ScaleBadge } from './ScaleBadge';
import { RelativeTime } from './RelativeTime';
import styles from './TaskList.module.css';

type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE_PENDING_REPORT' | 'REPORTED';
type SortMode = 'newest' | 'oldest' | 'taskId';

type Props = {
  tasks: TaskListItem[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
};

const FILTERS: StatusFilter[] = ['ALL', 'OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT', 'REPORTED'];
const PAGE_SIZE = 12;

export function TaskList({ tasks, selectedTaskId, onSelectTask }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = tasks.filter((task) => {
      if (statusFilter !== 'ALL' && (task.status || '') !== statusFilter) return false;
      if (!needle) return true;
      return [task.taskId, task.title || '', task.actor || ''].some((v) => v.toLowerCase().includes(needle));
    });

    const sorted = [...rows].sort((a, b) => {
      if (sort === 'taskId') return a.taskId.localeCompare(b.taskId);
      const ta = Date.parse(a.updatedAt || '') || 0;
      const tb = Date.parse(b.updatedAt || '') || 0;
      return sort === 'newest' ? tb - ta : ta - tb;
    });

    return sorted;
  }, [tasks, search, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className={styles.wrap}>
      <div className={styles.filters}>
        <div className={styles.tabs}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`${styles.tab} ${statusFilter === filter ? styles.tabActive : ''}`}
              onClick={() => {
                setStatusFilter(filter);
                setPage(1);
              }}
            >
              {filter}
            </button>
          ))}
        </div>

        <input
          className={styles.input}
          placeholder="taskId / title / actor 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <select
          className={styles.select}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortMode);
            setPage(1);
          }}
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="taskId">taskId순</option>
        </select>
      </div>

      <ul className={styles.list}>
        {pageItems.map((task) => (
          <li key={task.taskId}>
            <button
              type="button"
              className={`${styles.card} ${selectedTaskId === task.taskId ? styles.cardSelected : ''}`}
              onClick={() => onSelectTask(task.taskId)}
            >
              <div className={styles.cardTop}>
                <code className={styles.taskId}>{task.taskId}</code>
                <StatusBadge status={task.status} />
              </div>
              <p className={styles.title}>{task.title || '(제목 없음)'}</p>
              <div className={styles.metaRow}>
                <ScaleBadge scale={task.scale} />
                <span>{task.actor || '-'}</span>
                <span className={styles.dot}>•</span>
                <RelativeTime value={task.updatedAt} />
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.pagination}>
        <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          이전
        </button>
        <span>
          {safePage} / {totalPages}
        </span>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          다음
        </button>
      </div>
    </section>
  );
}

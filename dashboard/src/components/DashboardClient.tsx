'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TaskListItem,
  ZigrixConversationData,
  ZigrixOverviewData,
  ZigrixTaskDetailData,
} from '@/types/dashboard';
import { TaskList } from './TaskList';
import { TaskDetailTab } from './TaskDetailTab';
import { EventLogTab } from './EventLogTab';
import { ConversationTab } from './ConversationTab';
import { buildTaskListItems } from '../lib/task-list';
import {
  bindSelectedTaskConversation,
  bindSelectedTaskDetail,
  bindSelectedTaskEvents,
} from '../lib/task-panel';
import styles from './DashboardClient.module.css';

type Props = {
  initialOverview: ZigrixOverviewData;
  initialTaskDetail: ZigrixTaskDetailData | null;
  initialConversation: ZigrixConversationData | null;
  initialSelectedTaskId: string | null;
  zigrixVersion: string;
};

type RightTab = 'detail' | 'events' | 'conversation';
type SseStatus = 'connected' | 'disconnected' | 'connecting';

const STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT', 'REPORTED'];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function DashboardClient({
  initialOverview,
  initialTaskDetail,
  initialConversation,
  initialSelectedTaskId,
  zigrixVersion,
}: Props) {
  const [overview, setOverview] = useState<ZigrixOverviewData>(initialOverview);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);
  const [taskDetail, setTaskDetail] = useState<ZigrixTaskDetailData | null>(initialTaskDetail);
  const [conversation, setConversation] = useState<ZigrixConversationData | null>(initialConversation);
  const [activeTab, setActiveTab] = useState<RightTab>('detail');
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const lastEventTsRef = useRef<string | null>(initialOverview.recentEvents[0]?.ts || null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const panelLoadTokenRef = useRef(0);

  const selectedTaskDetail = useMemo(
    () => bindSelectedTaskDetail(selectedTaskId, taskDetail),
    [selectedTaskId, taskDetail],
  );

  const selectedConversation = useMemo(
    () => bindSelectedTaskConversation(selectedTaskId, conversation),
    [selectedTaskId, conversation],
  );

  const selectedTaskEvents = useMemo(
    () => bindSelectedTaskEvents(selectedTaskId, taskDetail),
    [selectedTaskId, taskDetail],
  );

  const eventLogLoading = selectedTaskId !== null && selectedTaskDetail === null;

  const tasks = useMemo<TaskListItem[]>(() => buildTaskListItems(overview), [overview]);

  const loadTaskPanels = useCallback(async (taskId: string) => {
    const token = ++panelLoadTokenRef.current;

    const [detail, conv] = await Promise.all([
      fetchJson<ZigrixTaskDetailData>(`/api/tasks/${encodeURIComponent(taskId)}`),
      fetchJson<ZigrixConversationData>(`/api/tasks/${encodeURIComponent(taskId)}/conversation`),
    ]);

    if (panelLoadTokenRef.current !== token) return;

    setTaskDetail(detail);
    setConversation(conv);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextOverview = await fetchJson<ZigrixOverviewData>('/api/overview');
      setOverview(nextOverview);
      const latestTs = nextOverview.recentEvents[0]?.ts || null;
      if (latestTs) lastEventTsRef.current = latestTs;

      if (selectedTaskId) {
        setTaskDetail(null);
        setConversation(null);
        await loadTaskPanels(selectedTaskId);
      }
    } catch (err) {
      setError((err as Error).message || '새로고침 실패');
    } finally {
      setLoading(false);
    }
  }, [loadTaskPanels, selectedTaskId]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);

  const cancelTask = useCallback(async (taskId: string) => {
    try {
      setCancelling(true);
      setError(null);
      await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' });
      await refreshAll();
    } catch (err) {
      setError((err as Error).message || '태스크 취소 실패');
    } finally {
      setCancelling(false);
    }
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedTaskId) {
      panelLoadTokenRef.current += 1;
      setTaskDetail(null);
      setConversation(null);
      return;
    }

    setTaskDetail(null);
    setConversation(null);

    void loadTaskPanels(selectedTaskId).catch((err) => {
      setError((err as Error).message || '태스크 로딩 실패');
    });
  }, [loadTaskPanels, selectedTaskId]);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setSseStatus('connecting');

      const params = new URLSearchParams();
      if (selectedTaskId) params.set('taskId', selectedTaskId);
      if (lastEventTsRef.current) params.set('lastEventTs', lastEventTsRef.current);
      const url = `/api/stream${params.toString() ? `?${params.toString()}` : ''}`;

      const source = new EventSource(url);
      sourceRef.current = source;

      source.onopen = () => setSseStatus('connected');

      source.addEventListener('update', (ev) => {
        const payload = JSON.parse(ev.data) as { ts?: string; overview?: ZigrixOverviewData };
        if (payload.ts) lastEventTsRef.current = payload.ts;
        if (payload.overview) {
          setOverview(payload.overview);
          const latestTs = payload.overview.recentEvents[0]?.ts;
          if (latestTs) lastEventTsRef.current = latestTs;
        }
      });

      source.addEventListener('event_update', (ev) => {
        const payload = JSON.parse(ev.data) as {
          ts?: string;
          recentEvents?: ZigrixOverviewData['recentEvents'];
          taskHistory?: ZigrixOverviewData['taskHistory'];
          bucketCounts?: ZigrixOverviewData['bucketCounts'];
        };
        if (payload.ts) lastEventTsRef.current = payload.ts;
        setOverview((prev) => ({
          ...prev,
          recentEvents: payload.recentEvents || prev.recentEvents,
          taskHistory: payload.taskHistory || prev.taskHistory,
          bucketCounts: payload.bucketCounts || prev.bucketCounts,
        }));
      });

      source.addEventListener('task_detail_update', (ev) => {
        const payload = JSON.parse(ev.data) as { ts?: string; taskId?: string; detail?: ZigrixTaskDetailData };
        if (payload.ts) lastEventTsRef.current = payload.ts;
        if (payload.taskId && payload.taskId === selectedTaskId && payload.detail) {
          setTaskDetail(payload.detail);
        }
      });

      source.addEventListener('conversation_update', (ev) => {
        const payload = JSON.parse(ev.data) as {
          ts?: string;
          taskId?: string;
          sessionKeys?: string[];
          stream?: ZigrixConversationData['stream'];
          recentEvents?: ZigrixConversationData['recentEvents'];
          openclawAvailable?: boolean;
        };
        if (payload.ts) lastEventTsRef.current = payload.ts;
        if (payload.taskId && payload.taskId === selectedTaskId) {
          setConversation((prev) => ({
            generatedAt: new Date().toISOString(),
            taskId: payload.taskId || selectedTaskId,
            sessionKeys: payload.sessionKeys || prev?.sessionKeys || [],
            stream: payload.stream || prev?.stream || [],
            recentEvents: payload.recentEvents || prev?.recentEvents || [],
            sessions: prev?.sessions || [],
            openclawAvailable: payload.openclawAvailable ?? prev?.openclawAvailable ?? false,
          }));
        }
      });

      source.onerror = () => {
        setSseStatus('disconnected');
        source.close();
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (sourceRef.current) sourceRef.current.close();
    };
  }, [selectedTaskId]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span>Zigrix</span>
          <small className={styles.brandVersion}>v{zigrixVersion}</small>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.sseWrap}>
            <span className={`${styles.dot} ${styles[`dot_${sseStatus}`]}`} />
            <span>{sseStatus}</span>
          </div>
          <button type="button" onClick={() => void refreshAll()} disabled={loading}>새로고침</button>
          <button type="button" onClick={() => void logout()}>로그아웃</button>
        </div>
      </header>

      <div className={styles.statusBar}>
        {STATUS_ORDER.map((status) => (
          <span key={status} className={styles.statusItem}>
            {status} ({overview.bucketCounts[status] || 0})
          </span>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.layout}>
        <aside className={styles.left}>
          <TaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} />
        </aside>

        <section className={styles.right}>
          <nav className={styles.tabs}>
            <button type="button" className={activeTab === 'detail' ? styles.tabActive : ''} onClick={() => setActiveTab('detail')}>태스크 상세</button>
            <button type="button" className={activeTab === 'events' ? styles.tabActive : ''} onClick={() => setActiveTab('events')}>이벤트 로그</button>
            <button type="button" className={activeTab === 'conversation' ? styles.tabActive : ''} onClick={() => setActiveTab('conversation')}>대화 내역</button>
          </nav>

          <div className={styles.panel}>
            {activeTab === 'detail' && (
              <TaskDetailTab
                selectedTaskId={selectedTaskId}
                detail={selectedTaskDetail}
                onCancelTask={cancelTask}
                cancelling={cancelling}
              />
            )}
            {activeTab === 'events' && (
              <EventLogTab
                selectedTaskId={selectedTaskId}
                events={selectedTaskEvents}
                loading={eventLogLoading}
              />
            )}
            {activeTab === 'conversation' && (
              <ConversationTab
                selectedTaskId={selectedTaskId}
                conversation={selectedConversation}
              />
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

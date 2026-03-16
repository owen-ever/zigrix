'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ZigrixTaskDetailData } from '@/types/dashboard';
import { StatusBadge } from './StatusBadge';
import { ScaleBadge } from './ScaleBadge';
import { RelativeTime } from './RelativeTime';
import styles from './TaskDetailTab.module.css';

type Props = {
  detail: ZigrixTaskDetailData | null;
  onCancelTask: (taskId: string) => Promise<void>;
  cancelling: boolean;
};

type ExecutionUnit = {
  unitId?: string;
  title?: string;
  status?: string;
  owner?: string;
  workerAgent?: string;
  workPackages?: Array<{ name?: string; status?: string }>;
};

function doneCount(packages: Array<{ status?: string }> = []) {
  return packages.filter((pkg) => ['DONE', 'REPORTED', 'DONE_PENDING_REPORT', 'COMPLETED'].includes((pkg.status || '').toUpperCase())).length;
}

export function TaskDetailTab({ detail, onCancelTask, cancelling }: Props) {
  const [expanded, setExpanded] = useState(false);

  const executionUnits = useMemo(() => {
    const raw = detail?.meta?.data?.executionUnits;
    return Array.isArray(raw) ? (raw as ExecutionUnit[]) : [];
  }, [detail]);

  if (!detail) {
    return <div className={styles.empty}>태스크를 선택해 주세요.</div>;
  }

  const status = detail.task.status;
  const canCancel = status === 'OPEN' || status === 'IN_PROGRESS';

  const specLines = (detail.spec.preview || '').split(/\r?\n/);
  const preview = expanded ? specLines : specLines.slice(0, 20);

  const evidenceAgents = new Set(detail.evidence.agents.map((row) => row.agentId));
  const requiredAgents = Array.isArray(detail.evidence.merged?.requiredAgents)
    ? (detail.evidence.merged?.requiredAgents as string[])
    : Array.from(evidenceAgents);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h3>{detail.task.title || '(제목 없음)'}</h3>
          <code>{detail.task.taskId}</code>
        </div>
        <div className={styles.badges}>
          <StatusBadge status={status} />
          <ScaleBadge scale={detail.task.scale} />
        </div>
      </div>

      <div className={styles.metaRow}>
        <span>생성: <RelativeTime value={detail.spec.metadata.createdAt || null} /></span>
        <span>업데이트: <RelativeTime value={detail.task.updatedAt} /></span>
      </div>

      {canCancel && (
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => onCancelTask(detail.task.taskId)}
          disabled={cancelling}
        >
          {cancelling ? '취소 중...' : '태스크 취소'}
        </button>
      )}

      <section className={styles.section}>
        <h4>Execution Units</h4>
        {executionUnits.length === 0 ? (
          <p className={styles.muted}>Execution Units 정보가 없습니다.</p>
        ) : (
          <div className={styles.units}>
            {executionUnits.map((unit, idx) => {
              const packages = Array.isArray(unit.workPackages) ? unit.workPackages : [];
              const done = doneCount(packages);
              const total = packages.length;
              const percent = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <article key={unit.unitId || `${unit.title || 'unit'}-${idx}`} className={styles.unitCard}>
                  <div className={styles.unitTop}>
                    <strong>{unit.title || unit.unitId || `Unit ${idx + 1}`}</strong>
                    <span>{unit.status || '-'}</span>
                  </div>
                  <div className={styles.unitMeta}>
                    <span>unitId: {unit.unitId || '-'}</span>
                    <span>owner: {unit.owner || unit.workerAgent || '-'}</span>
                    <span>{done}/{total}</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${percent}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h4>Evidence</h4>
        {requiredAgents.length === 0 ? (
          <p className={styles.muted}>증적 제출 정보가 없습니다.</p>
        ) : (
          <ul className={styles.evidenceList}>
            {requiredAgents.map((agentId) => (
              <li key={agentId}>
                <span>{agentId}</span>
                <span>{evidenceAgents.has(agentId) ? '제출됨' : '미제출'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h4>Spec Preview</h4>
        {specLines.length === 0 ? (
          <p className={styles.muted}>스펙 파일이 없습니다.</p>
        ) : (
          <>
            <button type="button" className={styles.toggle} onClick={() => setExpanded((v) => !v)}>
              {expanded ? '접기' : '펼치기'}
            </button>
            <div className={styles.markdown}>
              <ReactMarkdown>{preview.join('\n')}</ReactMarkdown>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

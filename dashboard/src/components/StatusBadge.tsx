import styles from './StatusBadge.module.css';

type Props = {
  status?: string | null;
};

const STATUS_META: Record<string, { label: string; icon: string }> = {
  OPEN: { label: '대기', icon: '🔵' },
  IN_PROGRESS: { label: '진행 중', icon: '🟠' },
  BLOCKED: { label: '차단', icon: '🔴' },
  DONE_PENDING_REPORT: { label: '보고 대기', icon: '🟣' },
  REPORTED: { label: '보고 완료', icon: '🟢' },
};

export function StatusBadge({ status }: Props) {
  const normalized = (status || 'UNKNOWN').toUpperCase();
  const meta = STATUS_META[normalized] || { label: status || '알 수 없음', icon: '⚪' };
  return (
    <span className={`${styles.badge} ${(styles as Record<string, string>)[`status_${normalized}`] || styles.status_UNKNOWN}`}>
      <span aria-hidden>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

import styles from './ScaleBadge.module.css';

type Props = {
  scale?: string | null;
};

const SCALE_LABELS: Record<string, string> = {
  simple: 'simple',
  normal: 'normal',
  risky: 'risky',
  large: 'large',
};

export function ScaleBadge({ scale }: Props) {
  const normalized = (scale || 'unknown').toLowerCase();
  const label = SCALE_LABELS[normalized] || normalized;
  return <span className={`${styles.badge} ${(styles as Record<string, string>)[`scale_${normalized}`] || styles.scale_unknown}`}>{label}</span>;
}

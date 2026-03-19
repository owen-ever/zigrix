import fs from 'node:fs';
import path from 'node:path';

import { appendEvent } from '../state/events.js';
import { type ZigrixPaths } from '../state/paths.js';
import { loadTask, rebuildIndex } from '../state/tasks.js';

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function summarizeAgents(merged: Record<string, unknown>): string[] {
  const items = Array.isArray(merged.items) ? merged.items : [];
  const fromItems = items.flatMap((item) => typeof item === 'object' && item && 'agentId' in item ? [String((item as Record<string, unknown>).agentId)] : []);
  if (fromItems.length > 0) return fromItems;
  return Array.isArray(merged.presentAgents) ? merged.presentAgents.map(String) : [];
}

function collectAgentLines(merged: Record<string, unknown>): string[] {
  const items = Array.isArray(merged.items) ? merged.items : [];
  const lines = items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const evidence = (row.evidence && typeof row.evidence === 'object' ? row.evidence : {}) as Record<string, unknown>;
    const summary = evidence.summary ?? evidence.lastAssistant ?? evidence.verdict ?? '수행 기록 있음';
    return [`- ${String(row.agentId ?? 'unknown')}: ${String(summary)}`];
  });
  return lines.length > 0 ? lines : ['- 참여 에이전트 기록 없음'];
}

function collectRisks(merged: Record<string, unknown>): string[] {
  const risks = new Set<string>();
  const items = Array.isArray(merged.items) ? merged.items : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const evidence = ((item as Record<string, unknown>).evidence ?? {}) as Record<string, unknown>;
    const entries = Array.isArray(evidence.risks) ? evidence.risks : [];
    for (const risk of entries) risks.add(String(risk));
  }
  return [...risks];
}

function qaLine(merged: Record<string, unknown>): string {
  const present = new Set(Array.isArray(merged.presentAgents) ? merged.presentAgents.map(String) : []);
  const qaAgentId = typeof merged.qaAgentId === 'string' && merged.qaAgentId.trim().length > 0
    ? merged.qaAgentId
    : 'qa-zig';
  return present.has(qaAgentId)
    ? `- ${qaAgentId} evidence 존재, QA 수행됨`
    : `- ${qaAgentId} evidence 없음 또는 별도 QA 미실행`;
}

export function renderReport(paths: ZigrixPaths, params: { taskId: string; recordEvents?: boolean }): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  const merged = readJson(path.join(paths.evidenceDir, params.taskId, '_merged.json'));
  const title = String(task.title ?? params.taskId);
  const scale = String(task.scale ?? 'unknown');
  const agents = summarizeAgents(merged);
  const agentLines = collectAgentLines(merged);
  const risks = collectRisks(merged);
  const missing = Array.isArray(merged.missingAgents) ? merged.missingAgents.map(String) : [];
  const complete = Boolean(merged.complete ?? false);
  const finalState = complete ? '완료(REPORTED)' : '부분완료/추가확인필요';
  const summaryLines = [`- 태스크: \`${params.taskId}\` / ${title}`, `- 상태: ${finalState}`];
  if (agents.length > 0) summaryLines.push(`- 참여 에이전트: ${agents.join(', ')}`);
  const riskLines = [...(missing.length > 0 ? [`- 누락 에이전트: ${missing.join(', ')}`] : []), ...risks.map((risk) => `- ${risk}`)];
  if (riskLines.length === 0) riskLines.push('- 특이 리스크 없음');
  const report = [
    `작업유형: ${scale}`,
    '',
    '진행 요약',
    ...summaryLines,
    '',
    '에이전트별 수행 내역',
    ...agentLines,
    '',
    'QA 결과',
    qaLine(merged),
    '',
    '남은 리스크 / 후속 액션',
    ...riskLines,
    '',
    '피드백 요청',
    '- 만족도(1~5), 좋았던 점, 개선할 점 있으면 짧게 주세요.',
  ].join('\n');
  if (params.recordEvents) {
    appendEvent(paths.eventsFile, { event: 'user_report_prepared', taskId: params.taskId, phase: 'reporting', actor: 'zigrix', payload: { preview: report.slice(0, 300) } });
    appendEvent(paths.eventsFile, { event: 'feedback_requested', taskId: params.taskId, phase: 'reporting', actor: 'zigrix', payload: { questions: ['만족도(1~5)는?', '좋았던 점은?', '개선할 점은?'] } });
    rebuildIndex(paths);
  }
  return { ok: true, taskId: params.taskId, complete, missingAgents: missing, report };
}

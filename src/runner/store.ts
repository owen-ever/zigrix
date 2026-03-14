import fs from 'node:fs';
import path from 'node:path';

import type { ZigrixConfig } from '../config/schema.js';
import type { WorkflowRunRecord } from './schema.js';

export function ensureRunsDir(projectRoot: string, config: ZigrixConfig): string {
  const runsDir = path.resolve(projectRoot, config.paths.runsDir);
  fs.mkdirSync(runsDir, { recursive: true });
  return runsDir;
}

export function saveRunRecord(projectRoot: string, config: ZigrixConfig, record: WorkflowRunRecord): string {
  const runsDir = ensureRunsDir(projectRoot, config);
  const filePath = path.join(runsDir, `${record.runId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, config.runtime.jsonIndent)}\n`, 'utf8');
  return filePath;
}

export function loadRunRecord(projectRoot: string, config: ZigrixConfig, runIdOrPath: string): WorkflowRunRecord {
  const candidatePath = path.isAbsolute(runIdOrPath)
    ? runIdOrPath
    : path.join(path.resolve(projectRoot, config.paths.runsDir), runIdOrPath.endsWith('.json') ? runIdOrPath : `${runIdOrPath}.json`);
  return JSON.parse(fs.readFileSync(candidatePath, 'utf8')) as WorkflowRunRecord;
}

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE_PENDING_REPORT' | 'REPORTED';

export type TaskScale = 'simple' | 'normal' | 'risky' | 'large' | string;

export type ZigrixOverviewData = {
  generatedAt: string;
  updatedAt: string | null;
  bucketCounts: Record<string, number>;
  statusBuckets: Record<string, unknown[]>;
  activeTasks: Array<{
    taskId: string;
    status: string | null;
    updatedAt: string | null;
    scale: string | null;
    title: string | null;
  }>;
  recentEvents: Array<{
    ts?: string;
    event?: string;
    taskId?: string;
    status?: string;
    actor?: string;
    agentId?: string;
    targetAgent?: string;
    title?: string;
  }>;
  taskHistory: Array<{
    taskId: string;
    ts: string | null;
    event: string | null;
    status: string | null;
    scale: string | null;
    title: string | null;
    actor: string | null;
  }>;
  openclawAvailable: boolean;
};

export type ZigrixTaskDetailData = {
  generatedAt: string;
  task: {
    taskId: string;
    status: string | null;
    scale: string | null;
    title: string | null;
    updatedAt: string | null;
    latestEvent: string | null;
    events: Array<Record<string, unknown>>;
  };
  spec: {
    exists: boolean;
    path: string;
    metadata: Record<string, string>;
    nextAction: string | null;
    resumeHint: string | null;
    preview?: string;
  };
  meta: {
    exists: boolean;
    path: string;
    data: Record<string, unknown>;
  };
  evidence: {
    exists: boolean;
    path: string;
    agents: Array<{
      file: string;
      path: string;
      agentId: string;
      runId: string | null;
      sessionKey: string | null;
      sessionId: string | null;
      ts: string | null;
    }>;
    merged: (Record<string, unknown> & { path?: string }) | null;
  };
};

export type ZigrixConversationData = {
  generatedAt: string;
  taskId: string;
  sessionKeys: string[];
  stream: Array<{
    sessionKey: string;
    agentId: string;
    agentName: string;
    role: string | null;
    timestamp: number | null;
    ts: string | null;
    toolName: string | null;
    toolCallId: string | null;
    isError: boolean;
    content: unknown;
    raw: Record<string, unknown>;
  }>;
  recentEvents: Array<{
    ts: string | null;
    event: string | null;
    status: string | null;
    actor: string | null;
    targetAgent: string | null;
    runId: string | null;
    sessionKey: string | null;
  }>;
  sessions: Array<{
    sessionKey: string;
    ok: boolean;
    messageCount: number;
    error: string | null;
  }>;
  openclawAvailable: boolean;
};

export type TaskListItem = {
  taskId: string;
  status: string | null;
  title: string | null;
  scale: string | null;
  actor: string | null;
  updatedAt: string | null;
};

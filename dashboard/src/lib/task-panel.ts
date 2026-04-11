import type { ZigrixConversationData, ZigrixEventRow, ZigrixTaskDetailData } from '@/types/dashboard';

export function bindSelectedTaskDetail(
  selectedTaskId: string | null,
  detail: ZigrixTaskDetailData | null,
): ZigrixTaskDetailData | null {
  if (!selectedTaskId || !detail) return null;
  return detail.task.taskId === selectedTaskId ? detail : null;
}

export function bindSelectedTaskConversation(
  selectedTaskId: string | null,
  conversation: ZigrixConversationData | null,
): ZigrixConversationData | null {
  if (!selectedTaskId || !conversation) return null;
  return conversation.taskId === selectedTaskId ? conversation : null;
}

export function bindSelectedTaskEvents(
  selectedTaskId: string | null,
  detail: ZigrixTaskDetailData | null,
): ZigrixEventRow[] {
  const selectedDetail = bindSelectedTaskDetail(selectedTaskId, detail);
  return selectedDetail?.task.events ?? [];
}

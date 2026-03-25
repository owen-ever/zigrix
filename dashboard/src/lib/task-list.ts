import type { TaskListItem, ZigrixOverviewData } from '../types/dashboard';

export function buildTaskListItems(overview: ZigrixOverviewData): TaskListItem[] {
  const activeById = new Map(overview.activeTasks.map((row) => [row.taskId, row]));
  const historyById = new Map(overview.taskHistory.map((row) => [row.taskId, row]));
  const ids = new Set<string>([
    ...overview.taskHistory.map((row) => row.taskId),
    ...overview.activeTasks.map((row) => row.taskId),
  ]);

  return Array.from(ids).map((taskId) => {
    const history = historyById.get(taskId);
    const active = activeById.get(taskId);

    return {
      taskId,
      status: history?.status || active?.status || null,
      title: history?.title || active?.title || null,
      scale: history?.scale || active?.scale || null,
      actor: history?.actor || null,
      updatedAt: history?.ts || active?.updatedAt || null,
    };
  });
}

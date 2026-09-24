type ScheduleInterval = (callback: () => void, delay: number) => unknown;

export function createTaskPolling(
  refresh: () => void | Promise<void>,
  scheduleInterval: ScheduleInterval,
): () => void {
  let interval: unknown;
  return () => {
    if (interval !== undefined) return;
    interval = scheduleInterval(() => void refresh(), 3_000);
  };
}

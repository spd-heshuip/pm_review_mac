type ScheduleInterval = (callback: () => void, delay: number) => unknown;
type ClearInterval = (interval: unknown) => void;

export function createTaskPolling(
  refresh: () => void | Promise<void>,
  scheduleInterval: ScheduleInterval,
  clearInterval: ClearInterval,
): (shouldPoll: boolean) => void {
  let interval: unknown;
  return (shouldPoll) => {
    if (shouldPoll) {
      if (interval !== undefined) return;
      interval = scheduleInterval(() => void refresh(), 3_000);
      return;
    }
    if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

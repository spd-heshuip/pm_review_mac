import { describe, expect, it, vi } from "vitest";
import { createTaskPolling } from "./taskPolling.js";

describe("createTaskPolling", () => {
  it("polls only while a task is running", () => {
    const refresh = vi.fn();
    const schedule = vi.fn(() => 1);
    const clear = vi.fn();
    const update = createTaskPolling(refresh, schedule, clear);

    update(false);
    update(true);
    update(true);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 3_000);

    update(false);
    expect(clear).toHaveBeenCalledWith(1);
  });

  it("can restart polling after all running tasks finish", () => {
    const refresh = vi.fn();
    const schedule = vi.fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2);
    const clear = vi.fn();
    const update = createTaskPolling(refresh, schedule, clear);

    update(true);
    const tick = schedule.mock.calls[0][0];
    tick();
    update(false);
    update(true);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(1);
    expect(schedule).toHaveBeenCalledTimes(2);
  });
});

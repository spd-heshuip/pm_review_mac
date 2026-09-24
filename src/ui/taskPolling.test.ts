import { describe, expect, it, vi } from "vitest";
import { createTaskPolling } from "./taskPolling.js";

describe("createTaskPolling", () => {
  it("starts the refresh interval only once", () => {
    const refresh = vi.fn();
    const schedule = vi.fn(() => 1);
    const start = createTaskPolling(refresh, schedule);

    start();
    start();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 3_000);
  });
});

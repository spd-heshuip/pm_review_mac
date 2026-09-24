import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TaskStore } from "./taskStore.js";

describe("TaskStore", () => {
  it("persists a requirement-id task and lists it newest first", () => {
    const db = join(mkdtempSync(join(tmpdir(), "pm-review-")), "tasks.sqlite");
    const store = TaskStore.open(db);
    store.insert({
      id: "task-1",
      title: "112233",
      requirementId: "112233",
      tapdUrl: "",
      notes: "",
      status: "running",
      agentId: null,
      runId: null,
      assistantText: "",
      reportPath: null,
      branchWarning: null,
      errorMessage: null,
      createdAt: "2026-09-24T01:00:00.000Z",
      updatedAt: "2026-09-24T01:00:00.000Z",
    });
    store.update("task-1", { status: "completed", reportPath: "/tmp/112233.md", agentId: "bc-1" });
    const reopened = TaskStore.open(db);
    expect(reopened.get("task-1")?.status).toBe("completed");
    expect(reopened.list()[0]?.title).toBe("112233");
    store.close();
    reopened.close();
  });
});

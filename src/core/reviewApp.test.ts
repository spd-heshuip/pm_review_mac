import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtifactFile } from "./artifacts.js";
import { MissingApiKeyError, ReviewApp, type AgentGateway, type RunTerminal } from "./reviewApp.js";
import { TaskStore } from "./taskStore.js";

function terminal(overrides: Partial<RunTerminal> = {}): RunTerminal {
  return {
    status: "finished",
    assistantText: "报告已写好",
    artifacts: [{ path: "artifacts/tapd-requirement-clarity/112233-审查.md", updatedAt: "2026-09-24T00:00:00Z" }],
    gitBranches: [],
    readArtifact: async () => new TextEncoder().encode("# 审查\n\n结论"),
    ...overrides,
  };
}

function gateway(result: RunTerminal, seen: { prompts: string[]; cancelled: boolean; resumed: string[] }): AgentGateway {
  return {
    async start(prompt) {
      seen.prompts.push(prompt);
      return { agentId: "bc-1", runId: "run-1", terminal: Promise.resolve(result) };
    },
    async followUp(agentId, prompt) {
      seen.resumed.push(agentId);
      seen.prompts.push(prompt);
      return { runId: "run-2", terminal: Promise.resolve({ ...result, assistantText: "补充后仍没有报告文件", artifacts: [] }) };
    },
    async reattach(agentId, _runId) {
      seen.resumed.push(agentId);
      return { runId: "run-1", terminal: Promise.resolve(result) };
    },
    async cancel() {
      seen.cancelled = true;
    },
  };
}

function app(result: RunTerminal, key: string | null, seen = { prompts: [] as string[], cancelled: false, resumed: [] as string[] }) {
  const dir = mkdtempSync(join(tmpdir(), "pm-review-app-"));
  const files = new Map<string, string>();
  return {
    seen,
    app: new ReviewApp({
      store: TaskStore.open(join(dir, "tasks.sqlite")),
      secrets: { getApiKey: async () => key, setApiKey: async () => undefined },
      gateway: gateway(result, seen),
      files: {
        save: async (_taskId, fileName, bytes) => {
          const path = join(dir, fileName);
          files.set(path, new TextDecoder().decode(bytes));
          return path;
        },
        read: async (path) => files.get(path) ?? "",
      },
    }),
  };
}

describe("ReviewApp", () => {
  it("refuses to start without an api key", async () => {
    const { app: review } = app(terminal(), null);
    await expect(review.submit({ requirementId: "112233", tapdUrl: "", notes: "" }, [])).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(review.list()).toHaveLength(0);
  });

  it("sends only the requirement id and saves the markdown", async () => {
    const { app: review, seen } = app(terminal(), "cursor_test");
    const task = await review.submit({ requirementId: "112233", tapdUrl: "", notes: "" }, []);
    const settled = await review.settle(task.id);
    expect(seen.prompts[0]).toContain("需求 ID：112233");
    expect(seen.prompts[0]).not.toContain("mcpServers");
    expect(settled.status).toBe("completed");
    expect(settled.title).toBe("112233");
    expect(await review.readReport(task.id)).toContain("结论");
  });

  it("follows up on the same agent when the skill asks for scope", async () => {
    const { app: review, seen } = app(terminal({ assistantText: "NEEDS_SCOPE", artifacts: [], readArtifact: async () => new Uint8Array() }), "cursor_test");
    const task = await review.submit({ requirementId: "", tapdUrl: "", notes: "直播字幕" }, []);
    expect((await review.settle(task.id)).status).toBe("needs_input");
    await review.followUp(task.id, "入口在直播间底部字幕开关");
    const settled = await review.settle(task.id);
    expect(seen.resumed).toEqual(["bc-1"]);
    expect(settled.status).toBe("missing_report");
  });

  it("warns about a cursor branch and does not treat it as the report", async () => {
    const files: ArtifactFile[] = [{ path: "artifacts/CURRENT-字幕.md", updatedAt: "2026-09-24T00:00:00Z" }];
    const { app: review } = app(terminal({ artifacts: files, gitBranches: ["cursor/review-abc"] }), "cursor_test");
    const task = await review.submit({ requirementId: "9", tapdUrl: "", notes: "" }, []);
    const settled = await review.settle(task.id);
    expect(settled.branchWarning).toBe("云端多推了一条分支，报告仍以本机这份为准");
    expect(settled.status).toBe("completed");
  });

  it("cancels a running task without downloading a report", async () => {
    let resolveTerminal: (value: RunTerminal) => void = () => undefined;
    const pending = new Promise<RunTerminal>((resolve) => {
      resolveTerminal = resolve;
    });
    const seen = { prompts: [] as string[], cancelled: false, resumed: [] as string[] };
    const { app: review } = app(terminal(), "cursor_test", seen);
    const original = review.gateway;
    review.gateway = { ...original, start: async () => ({ agentId: "bc-1", runId: "run-1", terminal: pending }) };
    const task = await review.submit({ requirementId: "9", tapdUrl: "", notes: "" }, []);
    await review.cancel(task.id);
    resolveTerminal(terminal());
    const settled = await review.settle(task.id);
    expect(seen.cancelled).toBe(true);
    expect(settled.status).toBe("cancelled");
    expect(settled.reportPath).toBeNull();
  });
});

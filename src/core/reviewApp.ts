import { randomUUID } from "node:crypto";
import { pickReport, type ArtifactFile } from "./artifacts.js";
import { validateSubmission, type ImageAttachment } from "./input.js";
import { buildPrompt, taskTitle, type TaskInput } from "./prompt.js";
import { resolveStatus } from "./status.js";
import { TaskStore, type TaskRecord } from "./taskStore.js";

export class MissingApiKeyError extends Error {
  constructor() {
    super("请先在设置里保存 API Key");
  }
}

export interface RunTerminal {
  status: "finished" | "error" | "cancelled";
  assistantText: string;
  artifacts: ArtifactFile[];
  gitBranches: string[];
  readArtifact(path: string): Promise<Uint8Array>;
}

export interface AgentGateway {
  start(prompt: string, images: ImageAttachment[]): Promise<{ agentId: string; runId: string; terminal: Promise<RunTerminal> }>;
  followUp(agentId: string, prompt: string): Promise<{ runId: string; terminal: Promise<RunTerminal> }>;
  reattach(agentId: string, runId: string): Promise<{ runId: string; terminal: Promise<RunTerminal> }>;
  cancel(agentId: string, runId: string): Promise<void>;
}

export interface SecretStore {
  getApiKey(): Promise<string | null>;
  setApiKey(key: string): Promise<void>;
}

export interface ReportFiles {
  save(taskId: string, fileName: string, bytes: Uint8Array): Promise<string>;
  read(path: string): Promise<string>;
}

export class ReviewApp {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: {
      store: TaskStore;
      secrets: SecretStore;
      gateway: AgentGateway;
      files: ReportFiles;
    },
  ) {}

  get gateway(): AgentGateway {
    return this.deps.gateway;
  }

  set gateway(gateway: AgentGateway) {
    this.deps.gateway = gateway;
  }

  list(): TaskRecord[] {
    return this.deps.store.list();
  }

  async readReport(taskId: string): Promise<string | null> {
    const task = this.deps.store.get(taskId);
    if (!task?.reportPath) return null;
    return this.deps.files.read(task.reportPath);
  }

  async submit(input: TaskInput, images: ImageAttachment[]): Promise<TaskRecord> {
    validateSubmission(input, images);
    const apiKey = await this.deps.secrets.getApiKey();
    if (!apiKey) throw new MissingApiKeyError();
    const now = new Date().toISOString();
    const id = randomUUID();
    this.deps.store.insert({
      id,
      title: taskTitle(input),
      requirementId: input.requirementId.trim(),
      tapdUrl: input.tapdUrl.trim(),
      notes: input.notes.trim(),
      status: "running",
      agentId: null,
      runId: null,
      assistantText: "",
      reportPath: null,
      branchWarning: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    try {
      const started = await this.deps.gateway.start(buildPrompt(input), images);
      this.deps.store.update(id, { agentId: started.agentId, runId: started.runId });
      this.pending.set(id, this.finish(id, started.terminal));
    } catch (error) {
      this.deps.store.update(id, { status: "failed", errorMessage: error instanceof Error ? error.message : "任务没启动" });
    }
    return this.mustGet(id);
  }

  async followUp(taskId: string, text: string): Promise<TaskRecord> {
    const task = this.mustGet(taskId);
    if (!task.agentId) throw new Error("任务还没有 Cloud Agent");
    if (task.status === "running" || task.status === "cancelled") throw new Error("当前状态不能补充");
    const started = await this.deps.gateway.followUp(task.agentId, text);
    this.deps.store.update(taskId, { status: "running", runId: started.runId, errorMessage: null });
    this.pending.set(taskId, this.finish(taskId, started.terminal));
    return this.mustGet(taskId);
  }

  async cancel(taskId: string): Promise<TaskRecord> {
    const task = this.mustGet(taskId);
    if (task.status !== "running" || !task.agentId || !task.runId) return task;
    this.deps.store.update(taskId, { status: "cancelled" });
    try {
      await this.deps.gateway.cancel(task.agentId, task.runId);
    } catch (error) {
      this.deps.store.update(taskId, {
        status: "cancelled",
        errorMessage: error instanceof Error ? error.message : "取消失败",
      });
    }
    return this.mustGet(taskId);
  }

  async settle(taskId: string): Promise<TaskRecord> {
    await this.pending.get(taskId);
    return this.mustGet(taskId);
  }

  restoreRunning(): void {
    for (const task of this.deps.store.list()) {
      if (task.status !== "running" || !task.agentId || !task.runId) continue;
      const agentId = task.agentId;
      const runId = task.runId;
      this.pending.set(task.id, this.deps.gateway.reattach(agentId, runId).then((started) => this.finish(task.id, started.terminal)));
    }
  }

  private async finish(taskId: string, terminalPromise: Promise<RunTerminal>): Promise<void> {
    const current = this.mustGet(taskId);
    if (current.status === "cancelled") return;
    try {
      const terminal = await terminalPromise;
      if (this.mustGet(taskId).status === "cancelled") return;
      const failed = terminal.status === "error";
      const cancelled = terminal.status === "cancelled";
      let reportPath: string | null = null;
      if (!failed && !cancelled) {
        const latest = this.mustGet(taskId);
        const picked = pickReport(terminal.artifacts, latest.requirementId);
        if (picked) {
          const bytes = await terminal.readArtifact(picked.path);
          const fileName = picked.path.split("/").pop() || `${taskId}.md`;
          reportPath = await this.deps.files.save(taskId, fileName, bytes);
        }
      }
      if (this.mustGet(taskId).status === "cancelled") return;
      const cursorBranch = terminal.gitBranches.find((branch) => branch.startsWith("cursor/"));
      this.deps.store.update(taskId, {
        status: resolveStatus({ cancelled, failed, reportPath, assistantText: terminal.assistantText }),
        assistantText: terminal.assistantText,
        reportPath,
        branchWarning: cursorBranch ? "云端多推了一条分支，报告仍以本机这份为准" : null,
        errorMessage: failed ? terminal.assistantText || "本轮执行失败" : null,
      });
    } catch (error) {
      if (this.mustGet(taskId).status === "cancelled") return;
      this.deps.store.update(taskId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "本轮执行失败",
      });
    }
  }

  private mustGet(id: string): TaskRecord {
    const task = this.deps.store.get(id);
    if (!task) throw new Error(`task not found: ${id}`);
    return task;
  }
}

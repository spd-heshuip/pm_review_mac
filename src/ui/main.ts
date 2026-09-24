import { renderReport } from "../core/reportView.js";
import type { TaskRecord } from "../core/taskStore.js";
import { createTaskPolling } from "./taskPolling.js";

const statusLabels: Record<TaskRecord["status"], string> = {
  running: "进行中",
  needs_input: "待补充",
  completed: "已完成",
  missing_report: "报告缺失",
  failed: "失败",
  cancelled: "已取消",
};

const bridgePort = new URLSearchParams(window.location.search).get("bridge");
const bridgeToken = new URLSearchParams(window.location.search).get("token") ?? "";
if (!bridgePort || !bridgeToken) throw new Error("未找到本地桥接服务");
const apiBase = `http://127.0.0.1:${bridgePort}`;

const settings = element<HTMLElement>("settings");
const composer = element<HTMLElement>("composer");
const detail = element<HTMLElement>("detail");
const settingsForm = element<HTMLFormElement>("settings-form");
const composerForm = element<HTMLFormElement>("composer-form");
const taskList = element<HTMLElement>("task-list");
const taskCount = element<HTMLElement>("task-count");
let refreshGeneration = 0;
const startTaskPolling = createTaskPolling(
  refreshTasks,
  (callback, delay) => window.setInterval(callback, delay),
);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const keyInput = element<HTMLInputElement>("api-key");
  const button = settingsForm.querySelector("button");
  if (!keyInput.value.trim() || !button) return;
  button.disabled = true;
  setMessage("settings-message", "");
  try {
    await api("/api/session", { method: "PUT", body: JSON.stringify({ key: keyInput.value.trim() }) });
    keyInput.value = "";
    showWorkspace();
    await refreshTasks();
    startTaskPolling();
  } catch (error) {
    setMessage("settings-message", errorMessage(error));
  } finally {
    button.disabled = false;
  }
});

composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(composerForm);
  const requirementId = String(form.get("requirementId") ?? "").trim();
  const tapdUrl = String(form.get("tapdUrl") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const files = Array.from(element<HTMLInputElement>("images").files ?? []);
  if (!requirementId && !tapdUrl && !notes && files.length === 0) {
    setMessage("composer-message", "至少填写一项：需求 ID、TAPD 链接、正文或功能入口");
    return;
  }

  const button = composerForm.querySelector("button");
  if (!button) return;
  button.disabled = true;
  setMessage("composer-message", "");
  try {
    const images = await Promise.all(files.map(readImage));
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ requirementId, tapdUrl, notes, images }),
    });
    composerForm.reset();
    await refreshTasks();
  } catch (error) {
    setMessage("composer-message", errorMessage(error));
  } finally {
    button.disabled = false;
  }
});

async function start(): Promise<void> {
  try {
    const session = await api<{ hasKey: boolean }>("/api/session");
    if (!session.hasKey) {
      settings.hidden = false;
      return;
    }
    showWorkspace();
    await refreshTasks();
    startTaskPolling();
  } catch (error) {
    settings.hidden = false;
    setMessage("settings-message", errorMessage(error));
  }
}

function showWorkspace(): void {
  settings.hidden = true;
  composer.hidden = false;
  detail.hidden = false;
}

async function refreshTasks(): Promise<void> {
  const generation = ++refreshGeneration;
  try {
    const tasks = await api<TaskRecord[]>("/api/tasks");
    if (generation !== refreshGeneration) return;
    taskCount.textContent = `${tasks.length} 条`;
    taskList.replaceChildren();
    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "提交第一条需求后，审查进度和报告会显示在这里。";
      taskList.append(empty);
      return;
    }
    for (const task of tasks) taskList.append(await createTaskCard(task));
  } catch (error) {
    setMessage("composer-message", errorMessage(error));
  }
}

async function createTaskCard(task: TaskRecord): Promise<HTMLElement> {
  const card = document.createElement("article");
  card.className = `task-card status-${task.status}`;

  const header = document.createElement("div");
  header.className = "task-header";
  const titleBox = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = task.title;
  const meta = document.createElement("p");
  meta.textContent = new Date(task.updatedAt).toLocaleString("zh-CN");
  titleBox.append(title, meta);
  const status = document.createElement("span");
  status.className = "status-chip";
  status.textContent = statusLabels[task.status];
  header.append(titleBox, status);
  card.append(header);

  if (task.branchWarning) card.append(messageBlock(task.branchWarning, "warning"));
  if (task.errorMessage) card.append(messageBlock(task.errorMessage, "error"));

  if (task.status === "completed") {
    if (task.assistantText) card.append(messageBlock(task.assistantText, "assistant-text"));
    try {
      const markdown = await apiText(`/api/tasks/${encodeURIComponent(task.id)}/report`);
      card.append(createReport(markdown, task));
    } catch (error) {
      card.append(messageBlock(errorMessage(error), "error"));
    }
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  if (task.status === "running") {
    actions.append(
      actionButton("取消", async () => {
        await api(`/api/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST" });
        await refreshTasks();
      }, "secondary"),
    );
  } else if (task.status !== "cancelled") {
    const followUp = document.createElement("textarea");
    followUp.rows = 2;
    followUp.placeholder = "补充范围、入口或验收标准";
    const send = actionButton("补充并继续", async () => {
      const text = followUp.value.trim();
      if (!text) return;
      await api(`/api/tasks/${encodeURIComponent(task.id)}/follow-up`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      await refreshTasks();
    });
    actions.append(followUp, send);
  }
  if (actions.childElementCount > 0) card.append(actions);
  return card;
}

function createReport(markdown: string, task: TaskRecord): HTMLElement {
  const container = document.createElement("div");
  container.className = "report";
  const toolbar = document.createElement("div");
  toolbar.className = "report-toolbar";
  toolbar.append(
    actionButton("复制 Markdown", async (button) => {
      await navigator.clipboard.writeText(markdown);
      button.textContent = "已复制";
    }, "secondary"),
    actionButton("导出 Markdown", async () => downloadMarkdown(markdown, task), "secondary"),
  );

  const view = renderReport(markdown);
  const body = document.createElement("div");
  body.className = "report-body";
  body.innerHTML = view.html;
  if (view.toc.length > 0) {
    const toc = document.createElement("nav");
    toc.className = "report-toc";
    const tocTitle = document.createElement("strong");
    tocTitle.textContent = "目录";
    toc.append(tocTitle);
    for (const item of view.toc) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = `toc-level-${item.level}`;
      link.textContent = item.text;
      link.addEventListener("click", () => body.querySelector(`#${item.id}`)?.scrollIntoView({ behavior: "smooth" }));
      toc.append(link);
    }
    container.append(toolbar, toc, body);
  } else {
    container.append(toolbar, body);
  }
  return container;
}

function actionButton(
  label: string,
  action: (button: HTMLButtonElement) => Promise<void>,
  variant = "primary",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = variant;
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await action(button);
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function messageBlock(text: string, className: string): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

async function readImage(file: File): Promise<{ dataBase64: string; mimeType: string; byteLength: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("截图读取失败"));
    reader.readAsDataURL(file);
  });
  return {
    dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mimeType: file.type,
    byteLength: file.size,
  };
}

function downloadMarkdown(markdown: string, task: TaskRecord): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  link.download = `${task.requirementId || task.title || task.id}-审查.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as T;
}

async function apiText(path: string): Promise<string> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error(await responseError(response));
  return response.text();
}

function apiUrl(path: string): string {
  const url = new URL(path, apiBase);
  url.searchParams.set("token", bridgeToken);
  return url.toString();
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `请求失败（${response.status}）`;
  } catch {
    return `请求失败（${response.status}）`;
  }
}

function setMessage(id: string, message: string): void {
  element<HTMLElement>(id).textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

void start();

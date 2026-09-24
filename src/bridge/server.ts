import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { CursorGateway } from "../core/cursorGateway.js";
import type { ImageAttachment } from "../core/input.js";
import { ReviewApp, type AgentGateway, type ReportFiles, type SecretStore } from "../core/reviewApp.js";
import { TaskStore } from "../core/taskStore.js";
import { allowedCorsOrigin, hasValidBridgeToken } from "./security.js";

const execFileAsync = promisify(execFile);
const keychainAccount = "pm-review";
const keychainService = "cursor-api-key";
const dataDirectory =
  process.env.PM_REVIEW_DATA_DIR ?? join(homedir(), "Library", "Application Support", "pm-review");
const reportsDirectory = join(dataDirectory, "reports");
const bridgeToken = process.env.PM_REVIEW_BRIDGE_TOKEN;
if (!bridgeToken) throw new Error("PM_REVIEW_BRIDGE_TOKEN is not configured");

await mkdir(reportsDirectory, { recursive: true });

const secrets: SecretStore = {
  async getApiKey() {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a",
        keychainAccount,
        "-s",
        keychainService,
        "-w",
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  },
  async setApiKey(key: string) {
    await execFileAsync("security", [
      "add-generic-password",
      "-a",
      keychainAccount,
      "-s",
      keychainService,
      "-w",
      key,
      "-U",
    ]);
  },
};

const files: ReportFiles = {
  async save(taskId, fileName, bytes) {
    const taskDirectory = join(reportsDirectory, taskId);
    await mkdir(taskDirectory, { recursive: true });
    const path = join(taskDirectory, basename(fileName));
    await writeFile(path, bytes);
    return path;
  },
  read: (path) => readFile(path, "utf8"),
};

const unavailableGateway: AgentGateway = {
  start: async () => {
    throw new Error("请先在设置里保存 API Key");
  },
  followUp: async () => {
    throw new Error("请先在设置里保存 API Key");
  },
  reattach: async () => {
    throw new Error("请先在设置里保存 API Key");
  },
  cancel: async () => {
    throw new Error("请先在设置里保存 API Key");
  },
};

const apiKey = await secrets.getApiKey();
const app = new ReviewApp({
  store: TaskStore.open(join(dataDirectory, "tasks.sqlite")),
  secrets,
  gateway: apiKey ? new CursorGateway(apiKey) : unavailableGateway,
  files,
});
if (apiKey) app.restoreRunning();

const server = createServer(async (request, response) => {
  const requestUrl = request.url ?? "/";
  if (!hasValidBridgeToken(requestUrl, bridgeToken)) {
    sendJson(response, 401, { error: "未授权访问" });
    return;
  }
  const corsOrigin = allowedCorsOrigin(request.headers.origin);
  if (request.headers.origin && !corsOrigin) {
    sendJson(response, 403, { error: "不允许的请求来源" });
    return;
  }
  setCorsHeaders(response, corsOrigin);
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  try {
    const url = new URL(requestUrl, "http://127.0.0.1");
    const path = url.pathname;

    if (request.method === "GET" && path === "/api/session") {
      sendJson(response, 200, { hasKey: Boolean(await secrets.getApiKey()) });
      return;
    }

    if (request.method === "PUT" && path === "/api/session") {
      const body = await readJson(request);
      const key = stringField(body, "key").trim();
      if (!key) throw new HttpError(400, "API Key 不能为空");
      await secrets.setApiKey(key);
      app.gateway = new CursorGateway(key);
      app.restoreRunning();
      sendJson(response, 200, { hasKey: true });
      return;
    }

    if (request.method === "GET" && path === "/api/tasks") {
      sendJson(response, 200, app.list());
      return;
    }

    if (request.method === "POST" && path === "/api/tasks") {
      const body = await readJson(request);
      const images = imageFields(body.images);
      const task = await app.submit(
        {
          requirementId: optionalString(body.requirementId),
          tapdUrl: optionalString(body.tapdUrl),
          notes: optionalString(body.notes),
        },
        images,
      );
      sendJson(response, 201, task);
      return;
    }

    const taskRoute = path.match(/^\/api\/tasks\/([^/]+)\/(follow-up|cancel|report)$/);
    if (taskRoute) {
      const taskId = decodeURIComponent(taskRoute[1]);
      const action = taskRoute[2];
      if (request.method === "POST" && action === "follow-up") {
        const body = await readJson(request);
        sendJson(response, 200, await app.followUp(taskId, stringField(body, "text")));
        return;
      }
      if (request.method === "POST" && action === "cancel") {
        sendJson(response, 200, await app.cancel(taskId));
        return;
      }
      if (request.method === "GET" && action === "report") {
        const report = await app.readReport(taskId);
        if (report === null) throw new HttpError(404, "报告不存在");
        response.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" }).end(report);
        return;
      }
    }

    throw new HttpError(404, "接口不存在");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "请求失败";
    sendJson(response, status, { error: message });
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("桥接服务启动失败");
  process.stdout.write(`${address.port}\n`);
});

function setCorsHeaders(response: ServerResponse, origin: string | null): void {
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 100 * 1024 * 1024) throw new HttpError(413, "请求内容过大");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "请求格式错误");
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") throw new HttpError(400, `${field} 格式错误`);
  return value;
}

function imageFields(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) throw new HttpError(400, "images 格式错误");
  return value.map((image) => {
    if (!image || typeof image !== "object") throw new HttpError(400, "图片格式错误");
    const record = image as Record<string, unknown>;
    return {
      dataBase64: stringField(record, "dataBase64"),
      mimeType: stringField(record, "mimeType"),
      byteLength: typeof record.byteLength === "number" ? record.byteLength : 0,
    };
  });
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

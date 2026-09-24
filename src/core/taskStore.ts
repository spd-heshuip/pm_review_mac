import { DatabaseSync } from "node:sqlite";
import type { TaskStatus } from "./status.js";

export interface TaskRecord {
  id: string;
  title: string;
  requirementId: string;
  tapdUrl: string;
  notes: string;
  status: TaskStatus;
  agentId: string | null;
  runId: string | null;
  assistantText: string;
  reportPath: string | null;
  branchWarning: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export class TaskStore {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path: string): TaskStore {
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        tapd_url TEXT NOT NULL,
        notes TEXT NOT NULL,
        status TEXT NOT NULL,
        agent_id TEXT,
        run_id TEXT,
        assistant_text TEXT NOT NULL,
        report_path TEXT,
        branch_warning TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    return new TaskStore(db);
  }

  insert(record: TaskRecord): void {
    this.db.prepare(`
      INSERT INTO tasks (
        id, title, requirement_id, tapd_url, notes, status, agent_id, run_id,
        assistant_text, report_path, branch_warning, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.title, record.requirementId, record.tapdUrl, record.notes, record.status,
      record.agentId, record.runId, record.assistantText, record.reportPath, record.branchWarning,
      record.errorMessage, record.createdAt, record.updatedAt,
    );
  }

  update(id: string, patch: Partial<TaskRecord>): void {
    const current = this.get(id);
    if (!current) throw new Error(`task not found: ${id}`);
    this.insertOrReplace({ ...current, ...patch, id, updatedAt: new Date().toISOString() });
  }

  get(id: string): TaskRecord | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, string | null> | undefined;
    return row ? toRecord(row) : null;
  }

  list(): TaskRecord[] {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as Array<Record<string, string | null>>;
    return rows.map(toRecord);
  }

  close(): void {
    this.db.close();
  }

  private insertOrReplace(record: TaskRecord): void {
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(record.id);
    this.insert(record);
  }
}

function toRecord(row: Record<string, string | null>): TaskRecord {
  return {
    id: row.id ?? "",
    title: row.title ?? "",
    requirementId: row.requirement_id ?? "",
    tapdUrl: row.tapd_url ?? "",
    notes: row.notes ?? "",
    status: (row.status ?? "failed") as TaskRecord["status"],
    agentId: row.agent_id,
    runId: row.run_id,
    assistantText: row.assistant_text ?? "",
    reportPath: row.report_path,
    branchWarning: row.branch_warning,
    errorMessage: row.error_message,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

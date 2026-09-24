export type TaskStatus =
  | "running"
  | "needs_input"
  | "completed"
  | "missing_report"
  | "failed"
  | "cancelled";

export function resolveStatus(input: {
  cancelled: boolean;
  failed: boolean;
  reportPath: string | null;
  assistantText: string;
}): TaskStatus {
  if (input.cancelled) return "cancelled";
  if (input.failed) return "failed";
  if (input.reportPath) return "completed";
  if (
    input.assistantText.includes("NEEDS_SCOPE") ||
    input.assistantText.includes("NEEDS_CONTEXT") ||
    /[?？]/.test(input.assistantText)
  ) {
    return "needs_input";
  }
  return "missing_report";
}

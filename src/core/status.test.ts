import { describe, expect, it } from "vitest";
import { resolveStatus } from "./status.js";

const base = { cancelled: false, failed: false, reportPath: null, assistantText: "" };

describe("resolveStatus", () => {
  it("ranks cancel and failure before a report", () => {
    expect(resolveStatus({ ...base, cancelled: true, reportPath: "/a.md" })).toBe("cancelled");
    expect(resolveStatus({ ...base, failed: true, reportPath: "/a.md" })).toBe("failed");
  });

  it("completes when a markdown report exists", () => {
    expect(resolveStatus({ ...base, reportPath: "/tmp/report.md", assistantText: "NEEDS_SCOPE" })).toBe("completed");
  });

  it("asks for input when the skill stops or asks a question", () => {
    expect(resolveStatus({ ...base, assistantText: "NEEDS_SCOPE 请给出功能入口" })).toBe("needs_input");
    expect(resolveStatus({ ...base, assistantText: "NEEDS_CONTEXT" })).toBe("needs_input");
    expect(resolveStatus({ ...base, assistantText: "你现在是准备写 PRD，还是已经写完要做审查？" })).toBe("needs_input");
  });

  it("marks a finished run without a report or question as missing", () => {
    expect(resolveStatus({ ...base, assistantText: "审查已结束但没有写入文件" })).toBe("missing_report");
  });
});

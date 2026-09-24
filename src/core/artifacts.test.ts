import { describe, expect, it } from "vitest";
import { pickReport } from "./artifacts.js";

describe("pickReport", () => {
  it("returns null when no markdown exists", () => {
    expect(pickReport([{ path: "artifacts/shot.png", updatedAt: "2026-09-24T00:00:00Z" }])).toBeNull();
  });

  it("prefers the skill report name and then the newest file", () => {
    const picked = pickReport([
      { path: "artifacts/notes.md", updatedAt: "2026-09-24T03:00:00Z" },
      { path: "artifacts/tapd-requirement-clarity/CURRENT-直播字幕.md", updatedAt: "2026-09-24T01:00:00Z" },
      { path: "artifacts/tapd-requirement-clarity/CURRENT-旧.md", updatedAt: "2026-09-24T00:00:00Z" },
    ]);
    expect(picked?.path).toBe("artifacts/tapd-requirement-clarity/CURRENT-直播字幕.md");
  });

  it("prefers a file starting with the requirement id", () => {
    const picked = pickReport(
      [
        { path: "artifacts/other.md", updatedAt: "2026-09-24T03:00:00Z" },
        { path: "artifacts/112233-字幕审查.md", updatedAt: "2026-09-24T01:00:00Z" },
      ],
      "112233",
    );
    expect(picked?.path).toBe("artifacts/112233-字幕审查.md");
  });
});

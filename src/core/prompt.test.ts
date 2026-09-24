import { describe, expect, it } from "vitest";
import { buildPrompt, hasMaterial, taskTitle } from "./prompt.js";

describe("buildPrompt", () => {
  it("keeps a requirement id as its own line", () => {
    const prompt = buildPrompt({ requirementId: "112233", tapdUrl: "", notes: "" });
    expect(prompt.startsWith("/tapd-requirement-clarity-review")).toBe(true);
    expect(prompt).toContain("需求 ID：112233");
    expect(prompt).not.toContain("TAPD 链接：");
    expect(prompt).not.toContain("https://www.tapd.cn");
    expect(prompt).toContain("不要 commit，不要 push");
    expect(prompt).toContain("Cloud Agent artifacts");
  });

  it("omits empty material lines", () => {
    const prompt = buildPrompt({
      requirementId: "",
      tapdUrl: "https://www.tapd.cn/tapd_fe/123/story/detail/456",
      notes: "我在写 PRD，先看线上现状",
    });
    expect(prompt).not.toContain("需求 ID：");
    expect(prompt).toContain("TAPD 链接：https://www.tapd.cn/tapd_fe/123/story/detail/456");
    expect(prompt).toContain("补充说明：我在写 PRD，先看线上现状");
  });
});

describe("task identity", () => {
  it("uses the requirement id as the title", () => {
    expect(taskTitle({ requirementId: "112233", tapdUrl: "https://tapd.cn/x", notes: "正文" })).toBe("112233");
  });

  it("rejects empty material", () => {
    expect(hasMaterial({ requirementId: " ", tapdUrl: "", notes: "" })).toBe(false);
  });
});

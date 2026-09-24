import { describe, expect, it } from "vitest";
import { renderReport } from "./reportView.js";

describe("renderReport", () => {
  it("builds a table of contents from headings", () => {
    const view = renderReport("# 标题\n\n## 一、审查结论\n\n可开发\n\n## 二、完善建议\n");
    expect(view.toc.map((item) => item.text)).toEqual(["一、审查结论", "二、完善建议"]);
    expect(view.html).toContain("可开发");
    expect(view.html).not.toContain("<script");
  });

  it("strips javascript: links from rendered html", () => {
    const view = renderReport("[点击](javascript:alert(1))");
    expect(view.html).not.toContain("javascript:");
  });

  it("escapes alt text in images to prevent attribute injection", () => {
    const view = renderReport('![x" onerror="alert(1)](https://example.com/a.png)');
    expect(view.html).not.toMatch(/"\s+onerror=/);
    expect(view.html).toContain('alt="x&quot; onerror=&quot;alert(1)"');
  });

  it("escapes ampersands in link href exactly once", () => {
    const view = renderReport("[example](https://example.com?a=1&b=2)");
    expect(view.html).toContain("&amp;");
    expect(view.html).not.toContain("&amp;amp;");
    expect(view.html).toContain('href="https://example.com?a=1&amp;b=2"');
  });
});

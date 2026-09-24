import { describe, expect, it } from "vitest";
import { renderReport, reportPreview } from "./reportView.js";

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

  it("previews the opening of a report without markdown syntax", () => {
    const preview = reportPreview(
      "# 标题\n\n## 一、审查结论\n\n登录入口的异常态没有写清。\n\n```js\nconsole.log('hidden')\n```\n\n[详情](https://example.com)",
      80,
    );
    expect(preview).toContain("审查结论");
    expect(preview).toContain("异常态没有写清");
    expect(preview).toContain("详情");
    expect(preview).not.toContain("console.log");
    expect(preview).not.toContain("https://example.com");
    expect(preview).not.toContain("#");
  });

  it("truncates a long report preview", () => {
    const preview = reportPreview(`结论${"补充".repeat(100)}`, 10);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(11);
  });

  it("escapes ampersands in link href exactly once", () => {
    const view = renderReport("[example](https://example.com?a=1&b=2)");
    expect(view.html).toContain("&amp;");
    expect(view.html).not.toContain("&amp;amp;");
    expect(view.html).toContain('href="https://example.com?a=1&amp;b=2"');
  });
});

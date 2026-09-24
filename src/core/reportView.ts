import { Marked } from "marked";

export interface ReportView {
  html: string;
  toc: Array<{ id: string; text: string; level: number }>;
}

export function renderReport(markdown: string): ReportView {
  const toc: ReportView["toc"] = [];
  const marked = new Marked();
  marked.setOptions({ gfm: true });
  marked.use({
    renderer: {
      heading({ text, depth }) {
        const plain = text.replace(/<[^>]+>/g, "");
        if (depth === 2 || depth === 3) {
          const id = `h-${toc.length}`;
          toc.push({ id, text: plain, level: depth });
          return `<h${depth} id="${id}">${escapeHtml(plain)}</h${depth}>`;
        }
        return `<h${depth}>${escapeHtml(plain)}</h${depth}>`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
    },
  });
  return {
    html: marked.parse(markdown, { async: false }) as string,
    toc,
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

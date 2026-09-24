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
      link({ href, title, tokens }) {
        const safeHref = sanitizeUrl(href);
        const text = this.parser.parseInline(tokens);
        if (!safeHref) return text;
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${text}</a>`;
      },
      image({ href, title, text }) {
        const safeSrc = sanitizeUrl(href);
        if (!safeSrc) return escapeHtml(text);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(text)}"${titleAttr}>`;
      },
    },
  });
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return {
    html: sanitizeRenderedHtml(rawHtml),
    toc,
  };
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;

  const protocolMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!protocolMatch) return null;

  const protocol = protocolMatch[1].toLowerCase();
  if (protocol === "http" || protocol === "https") return trimmed;
  return null;
}

const ATTR_URL_PATTERN = /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function sanitizeRenderedHtml(html: string): string {
  return html.replace(ATTR_URL_PATTERN, (_match, attr, _quoted, dbl, sgl, unquoted) => {
    const raw = (dbl ?? sgl ?? unquoted ?? "").trim();
    const safe = sanitizeUrl(raw);
    if (!safe) return ` ${attr}=""`;
    const quote = dbl !== undefined ? '"' : sgl !== undefined ? "'" : '"';
    return ` ${attr}=${quote}${safe}${quote}`;
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

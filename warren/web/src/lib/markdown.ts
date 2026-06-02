type BlockBoundary = "blank" | "code" | "heading" | "list" | "paragraph";

export function renderMarkdownToHtml(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const lines = escaped.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const boundary = blockBoundary(line);

    if (boundary === "blank") {
      index += 1;
      continue;
    }

    if (boundary === "code") {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      html.push(`<h${heading.level}>${renderInline(heading.text)}</h${heading.level}>`);
      index += 1;
      continue;
    }

    const list = listMatch(line);
    if (list) {
      const tag = list.ordered ? "ol" : "ul";
      const items: string[] = [];
      while (index < lines.length) {
        const next = listMatch(lines[index]);
        if (!next || next.ordered !== list.ordered) break;
        items.push(`<li>${renderInline(next.text)}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && blockBoundary(lines[index]) === "paragraph") {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("");
}

function blockBoundary(line: string): BlockBoundary {
  if (!line.trim()) return "blank";
  if (isFence(line)) return "code";
  if (headingMatch(line)) return "heading";
  if (listMatch(line)) return "list";
  return "paragraph";
}

function isFence(line: string): boolean {
  return /^```/.test(line.trim());
}

function headingMatch(line: string): { level: 1 | 2 | 3 | 4; text: string } | null {
  const match = /^(#{1,4})\s+(.+)$/.exec(line.trim());
  if (!match) return null;
  return { level: match[1].length as 1 | 2 | 3 | 4, text: match[2].trim() };
}

function listMatch(line: string): { ordered: boolean; text: string } | null {
  const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
  if (unordered) return { ordered: false, text: unordered[1].trim() };
  const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
  if (ordered) return { ordered: true, text: ordered[1].trim() };
  return null;
}

function renderInline(text: string): string {
  const codeTokens: string[] = [];
  let working = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = tokenFor("C", codeTokens.length);
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  const linkTokens: string[] = [];
  working = working.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    const token = tokenFor("L", linkTokens.length);
    const safeHref = safeHrefFromEscaped(href);
    linkTokens.push(`<a href="${safeHref}" rel="noopener noreferrer" target="_blank">${renderInlineFormatting(label)}</a>`);
    return token;
  });

  working = renderInlineFormatting(working);
  linkTokens.forEach((html, tokenIndex) => {
    working = working.replace(tokenFor("L", tokenIndex), html);
  });
  codeTokens.forEach((html, tokenIndex) => {
    working = working.replace(tokenFor("C", tokenIndex), html);
  });
  return working;
}

function renderInlineFormatting(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
}

function tokenFor(type: "C" | "L", index: number): string {
  return `\u0001${type}${index}\u0001`;
}

function safeHrefFromEscaped(href: string): string {
  const decoded = href.replace(/&amp;/g, "&").trim();
  if (/^(https?:|mailto:)/i.test(decoded) || decoded.startsWith("/") || decoded.startsWith("#")) {
    return href.replace(/"/g, "&quot;");
  }
  return "#";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

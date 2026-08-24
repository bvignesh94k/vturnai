import * as React from "react";

/**
 * A small, dependency-free markdown renderer for blog posts.
 *
 * Deliberately builds real React elements rather than an HTML string, so
 * there is no `dangerouslySetInnerHTML` anywhere in this path and therefore
 * no sanitisation to get right. Post bodies are admin-authored, not
 * publicly submitted, but every post still renders to every site visitor, so
 * a compromised admin session should not become a stored-XSS vector against
 * them. Supports the subset a blog post actually needs: headings, paragraphs,
 * bold, italic, inline code, links, lists, blockquotes, code fences and
 * horizontal rules. Anything else renders as plain text rather than failing.
 */

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

/** Only these href schemes are honoured; anything else renders as plain text. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("/") || /^mailto:/i.test(href);
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let index = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${index++}`;

    if (match[1] !== undefined) {
      nodes.push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-secondary px-1.5 py-0.5 text-[0.85em]">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const href = match[5];
      if (isSafeHref(href)) {
        const external = !href.startsWith("/") && !href.startsWith("mailto:");
        nodes.push(
          <a
            key={key}
            href={href}
            className="text-primary underline underline-offset-4"
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {match[4]}
          </a>,
        );
      } else {
        nodes.push(match[4]);
      }
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMarkdown(markdown: string): React.ReactNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockIndex = 0;
  const paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ");
    paragraphBuffer.length = 0;
    const key = `p-${blockIndex++}`;
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(text, key)}
      </p>,
    );
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={`code-${blockIndex++}`} className="overflow-x-auto rounded-lg border bg-secondary/50 p-4 text-sm">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const level = heading[1]!.length;
      const key = `h-${blockIndex++}`;
      const content = renderInline(heading[2]!, key);
      if (level === 1) blocks.push(<h2 key={key} className="mt-8 text-2xl font-semibold tracking-tight">{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={key} className="mt-6 text-xl font-semibold tracking-tight">{content}</h3>);
      else blocks.push(<h4 key={key} className="mt-5 text-lg font-semibold tracking-tight">{content}</h4>);
      i++;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      blocks.push(<hr key={`hr-${blockIndex++}`} className="my-8 border-border" />);
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const key = `bq-${blockIndex++}`;
      blocks.push(
        <blockquote key={key} className="border-l-2 border-primary/40 pl-4 italic text-muted-foreground">
          {renderInline(quoteLines.join(" "), key)}
        </blockquote>,
      );
      continue;
    }

    const unordered = /^[-*]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        const u = /^[-*]\s+(.*)$/.exec(t);
        const o = /^\d+\.\s+(.*)$/.exec(t);
        if (isOrdered && o) {
          items.push(o[1]!);
          i++;
        } else if (!isOrdered && u) {
          items.push(u[1]!);
          i++;
        } else {
          break;
        }
      }
      const key = `list-${blockIndex++}`;
      const itemNodes = items.map((item, idx) => (
        <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
      ));
      blocks.push(
        isOrdered ? (
          <ol key={key} className="list-decimal space-y-1.5 pl-6">
            {itemNodes}
          </ol>
        ) : (
          <ul key={key} className="list-disc space-y-1.5 pl-6">
            {itemNodes}
          </ul>
        ),
      );
      continue;
    }

    paragraphBuffer.push(trimmed);
    i++;
  }
  flushParagraph();

  return <>{blocks}</>;
}

/** Strips markdown syntax down to plain text, for meta descriptions and list excerpts. */
export function markdownToPlainText(markdown: string, maxLength = 200): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}...` : plain;
}

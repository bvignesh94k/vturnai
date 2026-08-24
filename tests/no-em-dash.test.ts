import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The em dash is banned from this codebase, in shipped copy and in comments
 * alike. It kept reappearing because nothing enforced it, so this test is the
 * enforcement: a build fails before the character can reach production.
 *
 * Rewrite the sentence with a period, comma, colon or parentheses. Do not
 * substitute an en dash (U+2013), which reads the same way and is banned here
 * for the same reason.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".netlify",
  "coverage",
  "dist",
  "build",
]);

const SCAN_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".css",
  ".sql",
  ".md",
  ".json",
  ".toml",
  ".yml",
  ".yaml",
];

/**
 * Two regex character classes match separator bytes inside scraped third-party
 * page titles. They recognise a character someone else's HTML might contain,
 * they are not authored prose, so rewriting them would break title parsing.
 */
const ALLOWED: ReadonlyArray<string> = [
  join("src", "lib", "ai-engines", "prompt-suggestions.ts"),
  join("src", "lib", "analysis", "quick-check.ts"),
  join("tests", "no-em-dash.test.ts"),
];

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

describe("authored text contains no em dash", () => {
  it("finds no em dash outside the two title-parsing regexes", () => {
    const offenders: string[] = [];

    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file);
      if (ALLOWED.includes(rel)) continue;

      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (line.includes("—")) {
          offenders.push(`${rel.split(sep).join("/")}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders, `Em dash found. Rewrite with a period, comma, colon or parentheses:\n${offenders.join("\n")}`).toEqual([]);
  });
});

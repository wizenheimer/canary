#!/usr/bin/env node
// Stitch the shared doc snippets (docs/snippets/*.md) into every surface that
// renders them, so the scripting API and workflow rules cannot drift between
// the CLIs' --help, the agent skills, the subagents, and the README.
//
//   node scripts/stitch-docs.mjs --write   rewrite drifted files (idempotent)
//   node scripts/stitch-docs.mjs --check   exit 1 listing drifted files (CI)
//
// Two kinds of consumers:
//
//   1. Marked regions in markdown surfaces (README.md, skills/, agents/,
//      commands/, rules/). Everything between the markers is replaced:
//
//        <!-- canary:snippet api-browser -->
//        …overwritten on --write…
//        <!-- canary:end api-browser -->
//
//      Optional flags on the open marker:
//        cli=npx-cli   substitute `{{cli}}` with `npx @usecanary/cli`
//                      (default `canary` — what the CLI help shows)
//        fenced=js     wrap the snippet in a ```js fence (for bare script
//                      bodies under docs/snippets/examples/)
//
//   2. packages/cli-kit/src/snippets.generated.ts — one exported const per
//      snippet (`{{cli}}` pre-substituted with `canary`), imported by
//      scripting-help.ts. Mirrors the embed-daemon.mjs pattern: committed,
//      header-marked, compare-before-write.
//
// Dependency-free by design. Authoring rules: docs/snippets/README.md.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNIPPETS_DIR = join(root, "docs", "snippets");
const GENERATED_TS = join(
  root,
  "packages",
  "cli-kit",
  "src",
  "snippets.generated.ts"
);

// Markdown surfaces scanned for marker regions. plugins/canary/skills is a
// symlink to skills/, so walking skills/ covers it.
const MARKDOWN_ROOTS = ["README.md", "skills", "agents", "commands", "rules"];

const CLI_SUBSTITUTIONS = {
  canary: "canary",
  "npx-cli": "npx @usecanary/cli",
};

const OPEN_MARKER =
  /^<!-- canary:snippet ([a-z0-9-]+)((?: [a-z]+=[a-z0-9-]+)*) -->$/;
const CLOSE_MARKER = /^<!-- canary:end ([a-z0-9-]+) -->$/;

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  process.stderr.write("usage: node scripts/stitch-docs.mjs --write|--check\n");
  process.exit(1);
}

function fail(message) {
  process.stderr.write(`stitch-docs: error: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- snippets

async function loadSnippets() {
  const snippets = new Map();
  const dirs = [SNIPPETS_DIR, join(SNIPPETS_DIR, "examples")];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      fail(`snippet directory missing: ${relative(root, dir)}`);
    }
    for (const entry of entries) {
      if (
        !(entry.isFile() && entry.name.endsWith(".md")) ||
        entry.name === "README.md"
      ) {
        continue;
      }
      const name = entry.name.slice(0, -3);
      if (snippets.has(name)) {
        fail(`duplicate snippet name "${name}"`);
      }
      const raw = await readFile(join(dir, entry.name), "utf8");
      snippets.set(name, raw.replaceAll("\r\n", "\n").replace(/\n+$/, ""));
    }
  }
  if (snippets.size === 0) {
    fail("no snippets found in docs/snippets/");
  }
  return snippets;
}

function renderSnippet(snippets, name, flags, context) {
  const text = snippets.get(name);
  if (text === undefined) {
    fail(`unknown snippet "${name}" in ${context}`);
  }
  const cli = flags.cli ?? "canary";
  const substitution = CLI_SUBSTITUTIONS[cli];
  if (!substitution) {
    fail(
      `unknown cli variant "${cli}" in ${context} (expected: ${Object.keys(CLI_SUBSTITUTIONS).join(", ")})`
    );
  }
  let rendered = text.replaceAll("{{cli}}", substitution);
  if (flags.fenced) {
    rendered = `\`\`\`${flags.fenced}\n${rendered}\n\`\`\``;
  }
  return rendered;
}

// ---------------------------------------------------------- markdown stitch

function parseFlags(rawFlags, context) {
  const flags = {};
  for (const pair of rawFlags.trim().split(/\s+/).filter(Boolean)) {
    const [key, value] = pair.split("=");
    if (!(key === "cli" || key === "fenced")) {
      fail(`unknown marker flag "${key}" in ${context}`);
    }
    flags[key] = value;
  }
  return flags;
}

function stitchMarkdown(source, snippets, file) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const out = [];
  let open = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = line.match(OPEN_MARKER);
    const closed = line.match(CLOSE_MARKER);
    const context = `${file}:${i + 1}`;

    if (opened) {
      if (open) {
        fail(
          `nested marker "${opened[1]}" inside "${open.name}" at ${context}`
        );
      }
      open = { name: opened[1], flags: parseFlags(opened[2], context) };
      out.push(line);
      // Push split so the final join(eol) owns EVERY line ending — a CRLF
      // target must not end up with LF inside the stitched block.
      out.push(
        ...renderSnippet(snippets, open.name, open.flags, context).split("\n")
      );
      continue;
    }
    if (closed) {
      if (!open) {
        fail(`unmatched end marker "${closed[1]}" at ${context}`);
      }
      if (closed[1] !== open.name) {
        fail(
          `marker mismatch at ${context}: open "${open.name}", end "${closed[1]}"`
        );
      }
      open = null;
      out.push(line);
      continue;
    }
    if (!open) {
      out.push(line);
    }
    // Lines inside an open region are dropped — the snippet replaced them.
  }

  if (open) {
    fail(`unclosed marker "${open.name}" in ${file}`);
  }
  return out.join(eol);
}

async function markdownTargets() {
  const targets = [];
  async function walk(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(md|mdc)$/.test(entry.name)) {
        targets.push(full);
      }
    }
  }
  for (const entry of MARKDOWN_ROOTS) {
    const full = join(root, entry);
    let info;
    try {
      info = await stat(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      await walk(full);
    } else {
      targets.push(full);
    }
  }
  return targets.sort();
}

// ------------------------------------------------------------ generated TS

function constName(snippetName) {
  return snippetName.replaceAll("-", "_").toUpperCase();
}

function generateTs(snippets) {
  const names = [...snippets.keys()].sort();
  const constNames = new Set();
  const lines = [
    "// AUTO-GENERATED by scripts/stitch-docs.mjs. DO NOT EDIT.",
    "// Source of truth: docs/snippets/ — edit there, then run `make docs`.",
    "// `{{cli}}` tokens are pre-substituted with the bare `canary` invocation.",
    "",
  ];
  for (const name of names) {
    const cn = constName(name);
    if (constNames.has(cn)) {
      fail(`snippet names "${name}" collide on generated const ${cn}`);
    }
    constNames.add(cn);
    const rendered = renderSnippet(snippets, name, {}, "snippets.generated.ts");
    lines.push(`export const ${cn} = ${JSON.stringify(rendered)};`, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// ------------------------------------------------------------------- main

const snippets = await loadSnippets();
const drifted = [];
let written = 0;

async function reconcile(path, next) {
  let current = null;
  try {
    current = await readFile(path, "utf8");
  } catch {
    // Missing file counts as drift (e.g. the generated module on first run).
  }
  if (current === next) {
    return;
  }
  if (mode === "--write") {
    await writeFile(path, next);
    written += 1;
  } else {
    drifted.push(relative(root, path));
  }
}

for (const target of await markdownTargets()) {
  const source = await readFile(target, "utf8");
  if (!source.includes("<!-- canary:snippet ")) {
    continue;
  }
  await reconcile(
    target,
    stitchMarkdown(source, snippets, relative(root, target))
  );
}

await reconcile(GENERATED_TS, generateTs(snippets));

if (mode === "--check" && drifted.length > 0) {
  process.stderr.write(
    `stitch-docs: ${drifted.length} file(s) out of sync with docs/snippets/ — run \`make docs\`:\n` +
      drifted.map((path) => `  ${path}\n`).join("")
  );
  process.exit(1);
}
process.stdout.write(
  mode === "--write"
    ? `stitch-docs: wrote ${written} file(s)\n`
    : "stitch-docs: all stitched docs up to date\n"
);

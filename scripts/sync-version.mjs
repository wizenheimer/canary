#!/usr/bin/env node
// Set one lockstep version across the whole workspace.
//
//   node scripts/sync-version.mjs <new-version>
//
// Writes <new-version> into the "version" of every workspace package.json
// (root + apps/* + packages/*, except @usecanary/config which is intentionally
// pinned at 0.0.0), plus every plugin-pack manifest when present: the Claude
// Code manifests under .claude-plugin/ (top-level "version" + each
// plugins[].version), the Cursor and Codex plugin.json files, and each
// skills/*/SKILL.md frontmatter `metadata.version`. Keeping every package in
// lockstep means `pnpm publish`'s workspace:* -> semver rewrite never pins a
// stale internal version — and plugin marketplaces (which compare manifest
// versions to detect updates) always see the new release.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if (!(version && SEMVER.test(version))) {
  process.stderr.write("usage: node scripts/sync-version.mjs <semver>\n");
  process.exit(1);
}

// @usecanary/config has no meaningful version; leave it at 0.0.0.
const SKIP = new Set(["@usecanary/config"]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function packageJsonPaths() {
  const paths = [join(root, "package.json")];
  for (const group of ["apps", "packages"]) {
    const dir = join(root, group);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        paths.push(join(dir, entry.name, "package.json"));
      }
    }
  }
  return paths;
}

let updated = 0;
for (const path of await packageJsonPaths()) {
  let pkg;
  try {
    pkg = await readJson(path);
  } catch {
    continue;
  }
  if (SKIP.has(pkg.name)) {
    continue;
  }
  pkg.version = version;
  await writeJson(path, pkg);
  updated += 1;
}

// Claude Code plugin manifests (optional — created in the plugin workstream).
const pluginJson = join(root, ".claude-plugin", "plugin.json");
try {
  const plugin = await readJson(pluginJson);
  plugin.version = version;
  await writeJson(pluginJson, plugin);
  updated += 1;
} catch {
  // no plugin manifest yet
}

const marketplaceJson = join(root, ".claude-plugin", "marketplace.json");
try {
  const marketplace = await readJson(marketplaceJson);
  marketplace.version = version;
  for (const entry of marketplace.plugins ?? []) {
    entry.version = version;
  }
  await writeJson(marketplaceJson, marketplace);
  updated += 1;
} catch {
  // no marketplace manifest yet
}

// Cursor + Codex plugin manifests (optional — same pattern as .claude-plugin).
for (const manifestPath of [
  join(root, ".cursor-plugin", "plugin.json"),
  join(root, "plugins", "canary", ".codex-plugin", "plugin.json"),
]) {
  try {
    const plugin = await readJson(manifestPath);
    plugin.version = version;
    await writeJson(manifestPath, plugin);
    updated += 1;
  } catch {
    // manifest not present
  }
}

// Skill pack: `metadata.version` in each skills/*/SKILL.md frontmatter.
// Line-based rewrite (no YAML dependency): inside the first `---…---` block,
// replace the `version:` line indented under `metadata:`.
try {
  const skillsDir = join(root, "skills");
  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    let source;
    try {
      source = await readFile(skillPath, "utf8");
    } catch {
      continue;
    }
    const lines = source.split("\n");
    const frontmatterEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
    if (frontmatterEnd === -1) {
      continue;
    }
    const metadataAt = lines.findIndex(
      (line, index) =>
        index > 0 && index < frontmatterEnd && /^metadata:\s*$/.test(line)
    );
    if (metadataAt === -1) {
      continue;
    }
    for (let i = metadataAt + 1; i < frontmatterEnd; i += 1) {
      if (!/^\s/.test(lines[i])) {
        break; // left the metadata block
      }
      const match = lines[i].match(/^(\s+)version:\s*\S/);
      if (match) {
        const next = `${match[1]}version: ${version}`;
        if (lines[i] !== next) {
          lines[i] = next;
          await writeFile(skillPath, lines.join("\n"));
          updated += 1;
        }
        break;
      }
    }
  }
} catch {
  // no skills directory
}

process.stdout.write(`sync-version: wrote ${version} to ${updated} files\n`);

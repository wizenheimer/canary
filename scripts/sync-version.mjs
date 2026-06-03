#!/usr/bin/env node
// Set one lockstep version across the whole workspace.
//
//   node scripts/sync-version.mjs <new-version>
//
// Writes <new-version> into the "version" of every workspace package.json
// (root + apps/* + packages/*, except @usecanary/config which is intentionally
// pinned at 0.0.0), plus the Claude Code plugin manifests under .claude-plugin/
// when present (top-level "version" + each plugins[].version). Keeping every
// package in lockstep means `pnpm publish`'s workspace:* -> semver rewrite never
// pins a stale internal version.
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

process.stdout.write(`sync-version: wrote ${version} to ${updated} files\n`);

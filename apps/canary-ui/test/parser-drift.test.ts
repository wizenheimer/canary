import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// canary-ui keeps its OWN copies of these parsers on purpose — importing
// @canary/* would drag the CLI's deps (zod, etc.) into the web bundle, and the
// packages export only a raw-TS condition Next can't resolve. The trade-off is
// drift risk: a fix to one copy must be mirrored to the other.
//
// This guard fails if a copy's LOGIC diverges from the canary source (comments
// and formatting are ignored). When it fails, sync the two files and update the
// matching test in apps/canary/src/report/.
const here = path.dirname(fileURLToPath(import.meta.url));
const appsDir = path.resolve(here, "..", "..");

const PAIRS: [string, string][] = [
  ["canary-ui/lib/parse-har.ts", "canary/src/report/parse-har.ts"],
  ["canary-ui/lib/parse-console.ts", "canary/src/report/parse-console.ts"],
];

// Strip comments and collapse whitespace so only executable logic is compared.
function normalize(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("canary-ui parser copies stay in sync with the canary source", () => {
  for (const [uiRel, canaryRel] of PAIRS) {
    it(`${uiRel} logic matches ${canaryRel}`, () => {
      const ui = readFileSync(path.join(appsDir, uiRel), "utf8");
      const canary = readFileSync(path.join(appsDir, canaryRel), "utf8");
      expect(normalize(ui)).toBe(normalize(canary));
    });
  }
});

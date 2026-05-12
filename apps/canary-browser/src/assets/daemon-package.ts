// Hardcoded package.json template written into ~/.dev-browser/package.json
// when the runtime is extracted. Mirrors EMBEDDED_PACKAGE_JSON in
// cli/src/daemon.rs:17-26 byte-for-byte (including the indentation, so the
// "skip rewrite if identical" check in extract.ts never thrashes).
export const EMBEDDED_PACKAGE_JSON = `{
  "name": "dev-browser-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "1.58.2",
    "playwright-core": "1.58.2",
    "quickjs-emscripten": "^0.32.0"
  }
}`;

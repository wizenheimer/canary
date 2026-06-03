// Argv preprocessing for optional-value flags.
//
// Commander supports `--option [value]` bracketed-optional syntax: bare
// `--connect` yields `true`; `--connect URL` yields `URL`. But commander will
// *not* consume the next token as the flag's value if the program defines a
// positional or subcommand for it — so `--connect chrome` could be parsed
// inconsistently depending on subcommand layout.
//
// To make optional-value parsing deterministic regardless of subcommand
// layout, we splice `--connect VALUE` into `--connect=VALUE` here. This is a
// lexical (not semantic) rewrite.
const OPTIONAL_VALUE_FLAGS = new Set(["--connect"]);

export function preprocessArgs(argv: readonly string[]): string[] {
  if (argv.length <= 1) {
    return argv.slice();
  }
  const out: string[] = [argv[0] as string];
  for (let i = 1; i < argv.length; i += 1) {
    const cur = argv[i] as string;
    if (!OPTIONAL_VALUE_FLAGS.has(cur)) {
      out.push(cur);
      continue;
    }
    if (i + 1 >= argv.length) {
      out.push(cur);
      continue;
    }
    const next = argv[i + 1] as string;
    if (next.startsWith("-")) {
      out.push(cur);
      continue;
    }
    out.push(`${cur}=${next}`);
    i += 1;
  }
  return out;
}

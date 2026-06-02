// Argv preprocessing mirroring cli-go/cmd/preprocess.go.
//
// Commander supports `--option [value]` bracketed-optional syntax: bare
// `--connect` yields `true`; `--connect URL` yields `URL`. But there is a
// subtle parity gap with clap's `num_args = 0..=1`: clap will greedily
// consume the next argv token as the flag's value as long as it doesn't
// start with `-` — even if that token happens to be a subcommand name.
// Commander, by contrast, will *not* consume the next token if the
// program defines a positional or subcommand for it.
//
// To match clap byte-for-byte, we splice `--connect VALUE` into
// `--connect=VALUE` here. After that splice, commander's optional-value
// parsing yields the exact same result regardless of subcommand layout.
//
// This is what cli-go does in PreprocessArgs and it's documented as the
// "lexical, not semantic" parity rule.
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

# create-canary

The setup wizard for [canary](https://github.com/usecanary/canary) — an AI-agent QA toolkit that
drives real browsers, records QA sessions (Playwright trace, video, network HAR, console), and
renders self-contained verification reports.

## Use

```bash
npm create canary
# or: npm init canary  ·  pnpm create canary  ·  yarn create canary
```

The wizard installs the canary runtime into `~/.canary` and offers to put the `canary` command
([`@usecanary/cli`](https://www.npmjs.com/package/@usecanary/cli)) on your PATH — plus optional
`canary-browser` and `canary-viewer` — so you can skip the `npx` prefix. It also wires up the agent
skill so a coding agent can record sessions for you.

## After setup

```bash
canary init                        # one-shot setup (runtime + agent skill)
canary session start --name "checkout"
canary-viewer                      # browse recorded sessions
```

MIT · [source](https://github.com/usecanary/canary)

- End each script by logging the state you need for the next decision — stdout is your
  observation channel.
- Use short timeouts (`{{cli}} run --timeout 10`) so a step fails fast instead of hanging on a
  missing element.
- In assertion / extraction steps, degrade gracefully — log a `WARN` / `FAIL` line instead of
  crashing, so the step still records its evidence. While exploring, a missed selector means
  look again (snapshot, fix, retry as a new step), not a silent fallback.
- End before you stop: `{{cli}} stop` shuts the daemon down and aborts any live session,
  skipping its report.html — always `{{cli}} session end <id>` first.

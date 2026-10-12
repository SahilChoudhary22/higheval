# Known limitations

Grouped by area. Each item says what the limit is, why it exists, and what would lift it.

## Evidence and statistics

- **Small task counts give wide, approximate intervals.** The sample suite has 16 tasks. Percentile bootstrap intervals are anti-conservative at this size, and degenerate when most tasks tie. The decision rule compensates: a direction is called only if the exact permutation test agrees (p ≤ 0.05), and equivalence needs at least 3/margin tasks. Detecting small effects needs more tasks (50+) more than more repetitions, because repetitions only reduce within-task noise.
- **Results generalize only to the suite.** A verdict says "on these tasks, under these settings". The sample tasks are synthetic, deterministic back-office calculations. They say little about open-ended writing, long-horizon work or tasks that need web access.
- **Ceiling effects.** Strong models solve most of the original twelve tasks perfectly, which hides differences. Four multi-step tasks were added after the pilot for that reason, and the suite was then frozen before the reported experiments. Suites should be calibrated so that no configuration is near 100%.
- **Binary-ish scores.** Most scorers are pass/fail, so task scores are coarse (fractions of total scorer weight). Paired differences are often exactly 0, ±0.5 or ±1. That is fine for the sign-flip test but makes the bootstrap distribution lumpy.
- **No multiple-comparison control.** Each experiment compares exactly two configurations. Running many experiments and reporting the best one inflates false positives. The practical margin and decision rule are fixed at launch to discourage tuning, but nothing enforces it across experiments.
- **Provider-side non-determinism is uncontrolled.** Hermes sends no temperature, and free OpenRouter endpoints may route to different upstream providers or quantizations over time. Interleaving the arms in a random order spreads drift across both, but cannot remove it. Repetitions estimate this noise; they do not eliminate it.

## Execution and isolation

- **The terminal tool is not sandboxed.** Hermes' `terminal` toolset runs commands on the host in the run's working directory, with Hermes' default "deny dangerous commands" policy as the only guard. The sample configurations use only `file` tools. Real isolation needs Hermes' Docker terminal backend (`terminal.backend: docker`), which is not wired up here.
- **An agent could read the expected answers.** Because tools are not confined (below), a deliberately adversarial agent could read the SQLite database that holds the scorers, or other runs' workspaces. None of the recorded runs did (every tool call and path is logged), but results for untrusted agents should be run in a container.
- **File tools are not confined to the workspace either.** Hermes' `file` tools accept absolute paths, so an agent can read or write anything the user running HighEval can. In the experiments, agents wrote helper scripts to `/tmp` and outputs one directory above the workspace. Run HighEval as an unprivileged user or in a container if the agents or tasks are untrusted.
- **Deliverables written outside the workspace score as missing.** Hermes' system prompt advertises a scratch directory inside its home. In the model-change experiment, Lightning sometimes wrote its final file there instead of the working directory. Scorers read only the workspace, which matches the task instructions, so this counts against the agent. The run inspector shows the actual `write_file` paths. Hiding the scratch directory would change Hermes' default behaviour, so it was left as is.
- **Tool output in the inspector is capped.** Hermes truncates `tool_result` output to 5,000 characters in its event stream. The agent saw the full output; the inspector shows the truncated copy and labels it.
- **The system prompt is not frozen.** Hermes injects the current date, host OS and working-directory path into its system prompt. These are identical for both arms within an experiment, but differ between experiments run on different days or machines.
- **Single node, global concurrency.** Runs are executed by the API process with a global concurrency limit (`MAX_CONCURRENT_RUNS`). There is no distributed worker pool. Throughput is bounded by one machine and the provider's rate limits.
- **Retries discard earlier attempts' events.** When a rate-limited run is retried, the inspector shows the final attempt; the attempt count records that retries happened.
- **Disk usage grows with runs.** Each run keeps its Hermes home, workspace and raw stream under `data/runs/` for auditability, about 7.7 MB apparent per run. 5 MB of that is a shared model-catalog snapshot, cloned copy-on-write where the filesystem supports it, so real usage is about 2.5 MB per run on APFS or Btrfs. There is no retention policy yet.
- **Built-in skills depend on the host.** A built-in skill limited to one operating system (the `apple` skills are macOS-only) is copied into every run but indexed only on that OS, so the same configuration can expose different skills on different machines. The snapshot records the selection, content hash and Hermes commit, not the host OS. The catalog is cached per Hermes commit, so editing the pinned checkout in place is not noticed until the API restarts.
- **Hermes footprint.** The pinned runtime is about 1.3 GB (Python, Node, ripgrep, ffmpeg and the venv), installed once into `.hermes-runtime/`.

## Product scope

- **Two arms per experiment.** A/B comparisons only. Comparing N configurations would need multiplicity-aware statistics.
- **The LLM judge is uncalibrated.** Judge ratings have not been compared with human labels, so they are an informed assumption rather than a measurement. In the sample runs the judge (a small, fast free model) rated most replies 5/5, which suggests leniency; required deterministic checks still gate hard failures. The two kinds of scorer also check each other: in the first real run, a required check failed a reply the judge rated 4.5/5, and the run inspector showed the check itself was wrong (it rejected a non-breaking hyphen in "5‑7"), so it was fixed. Deterministic checks need tests against real model output, not just hand-written examples. A stronger judge and calibration are the next steps (see `docs/design.md`).
- **Absolute ratings, not pairwise.** The judge rates each reply on its own 1–5 scale. Pairwise A/B judging in both orders would be more sensitive and cancel position bias, but is not built yet.
- **Single-turn conversations only.** Tasks are one message and one reply; multi-turn scripted conversations are designed but not implemented.
- **Judges add requests.** Each judged run costs one more request (two if the first verdict is unusable), on top of the agent's own.
- **Configuration dimensions.** Model, skills, Hermes built-in skills (none, all or selected), memory (disabled or seeded), toolsets, max turns and timeout are configurable. Reasoning effort, system-prompt overrides and provider routing preferences are pinned, not configurable.
- **OpenRouter only.** Other providers Hermes supports (including subscription-based ones) are not wired up.
- **Single user, no authentication.** The API binds to `127.0.0.1` by default and rejects foreign `Host` headers and cross-site state-changing requests, which blocks drive-by attacks from web pages. There is still no login: exposing it publicly would let anyone spend your provider quota.
- **macOS and Linux only.** The start scripts are bash and process groups are POSIX; Windows would need WSL2 (untested).
- **Provider key exposure.** The OpenRouter key is passed to each Hermes process. Hermes strips provider keys from the environment of the tools it launches, so an agent's terminal commands cannot print it.
- **Suite editing is JSON.** Suites are edited as validated JSON with live schema feedback rather than through a form builder.
- **Polling, not push.** Live progress refreshes every few seconds by polling. Server-sent events would reduce latency and load.

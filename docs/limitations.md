# Known limitations

Grouped by area. Each item says what the limit is, why it exists, and what would lift it.

## Evidence and statistics

- **Small task counts give wide, approximate intervals.** The sample suite has 16 tasks. Percentile bootstrap intervals are anti-conservative at this size: true coverage is somewhat below 95%. The permutation p-value is a second, assumption-light check. Reliable conclusions about small effects need more tasks (50+) more than more repetitions, because repetitions only reduce within-task noise.
- **Results generalize only to the suite.** A verdict says "on these tasks, under these settings". The sample tasks are synthetic, deterministic back-office calculations. They say little about open-ended writing, long-horizon work or tasks that need web access.
- **Ceiling effects.** Strong models solve most of the original twelve tasks perfectly, which hides differences. Four multi-step tasks were added after the pilot for that reason, and the suite was then frozen before the reported experiments. Suites should be calibrated so that no configuration is near 100%.
- **Binary-ish scores.** Most scorers are pass/fail, so task scores are coarse (fractions of total scorer weight). Paired differences are often exactly 0, ±0.5 or ±1. That is fine for the sign-flip test but makes the bootstrap distribution lumpy.
- **No multiple-comparison control.** Each experiment compares exactly two configurations. Running many experiments and reporting the best one inflates false positives. The practical margin and decision rule are fixed at launch to discourage tuning, but nothing enforces it across experiments.
- **Provider-side non-determinism is uncontrolled.** Hermes sends no temperature, and free OpenRouter endpoints may route to different upstream providers or quantizations over time. Interleaving the arms in a random order spreads drift across both, but cannot remove it. Repetitions estimate this noise; they do not eliminate it.

## Execution and isolation

- **The terminal tool is not sandboxed.** Hermes' `terminal` toolset runs commands on the host in the run's working directory, with Hermes' default "deny dangerous commands" policy as the only guard. The sample configurations use only `file` tools. Real isolation needs Hermes' Docker terminal backend (`terminal.backend: docker`), which is not wired up here.
- **Deliverables written outside the workspace score as missing.** Hermes' system prompt advertises a scratch directory inside its home. In the model-change experiment, Lightning sometimes wrote its final file there instead of the working directory. Scorers read only the workspace, which matches the task instructions, so this counts against the agent. The run inspector shows the actual `write_file` paths. Hiding the scratch directory would change Hermes' default behaviour, so it was left as is.
- **Tool output in the inspector is capped.** Hermes truncates `tool_result` output to 5,000 characters in its event stream. The agent saw the full output; the inspector shows the truncated copy and labels it.
- **The system prompt is not frozen.** Hermes injects the current date, host OS and working-directory path into its system prompt. These are identical for both arms within an experiment, but differ between experiments run on different days or machines.
- **Single node, global concurrency.** Runs are executed by the API process with a global concurrency limit (`MAX_CONCURRENT_RUNS`). There is no distributed worker pool. Throughput is bounded by one machine and the provider's rate limits.
- **Retries discard earlier attempts' events.** When a rate-limited run is retried, the inspector shows the final attempt; the attempt count records that retries happened.
- **Disk usage grows with runs.** Each run keeps its Hermes home, workspace and raw stream under `data/runs/` for auditability, about 7.7 MB apparent per run. 5 MB of that is a shared model-catalog snapshot, cloned copy-on-write where the filesystem supports it, so real usage is about 2.5 MB per run on APFS or Btrfs. There is no retention policy yet.
- **Hermes footprint.** The pinned runtime is about 1.3 GB (Python, Node, ripgrep, ffmpeg and the venv), installed once into `.hermes-runtime/`.

## Product scope

- **Two arms per experiment.** A/B comparisons only. Comparing N configurations would need multiplicity-aware statistics.
- **Deterministic scorers only.** There is no LLM-as-judge for subjective quality. It was left out deliberately (cost, variance, and judge drift contaminating the comparison), but it limits the platform to tasks with checkable answers.
- **Configuration dimensions.** Model, skills, memory (disabled or seeded), toolsets, max turns and timeout are configurable. Reasoning effort, system-prompt overrides and provider routing preferences are pinned, not configurable.
- **OpenRouter only.** Other providers Hermes supports (including subscription-based ones) are not wired up.
- **Single user, no authentication.** The API binds to `127.0.0.1` by default. Exposing it publicly would let anyone spend your provider quota.
- **Suite editing is JSON.** Suites are edited as validated JSON with live schema feedback rather than through a form builder.
- **Polling, not push.** Live progress refreshes every few seconds by polling. Server-sent events would reduce latency and load.

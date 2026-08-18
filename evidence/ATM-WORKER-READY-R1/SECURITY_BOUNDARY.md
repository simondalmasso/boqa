# Security boundary

Target repositories are hostile data. Frozen job authority cannot be widened by README/AGENTS/issues/logs/HTML/source/browser prompts.

Execution controls: disposable Docker; non-root UID; `--cap-drop ALL`; `no-new-privileges`; bounded pids/memory/cpu; read-only container root; tmpfs `/tmp`; no Docker socket/devices; writable target/output mounts only; `shell:false`; executable+argv allowlists; default hostile network `none`; exact npm lock required for hydration; hydration origins allowlisted; `npm ci --ignore-scripts`; Git hooks disabled; no target `.env` sourcing; environment deny-by-default; immutable 40-hex target SHA verified; realpath plus final Git diff restricted to `allowed_paths`; submodules and Git LFS refused; artifacts bounded and secret-scanned; deterministic execution ID; atomic state plus hash-chained ledger; terminal results idempotent.

Financial/model/marketplace/deploy/merge authority is zero. Worker observations are evidence, never ATM acceptance.

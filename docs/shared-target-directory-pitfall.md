# Known Issues & Gotchas

## Shared Cargo Target Directory Causes Database/Build Conflicts

**Discovered:** 2024-12-05

### Problem

If multiple clones of this project (e.g., `vibe-kanban`, `vibe-kanbanman`, `vibe-kanban-dev`) share the same Cargo target directory via `.cargo/config.toml`:

```toml
[build]
target-dir = "/Users/someone/projects/vibe-kanban/target"
```

This causes:
1. **Build conflicts**: Whichever project compiles last overwrites the shared binary
2. **Database sharing**: The `asset_dir()` path in `crates/utils/src/assets.rs` is determined by `CARGO_MANIFEST_DIR` at compile time - so all projects end up using the same database
3. **Mysterious compile errors**: Fields like `is_orchestrator` appearing as "missing" or "redundant" when switching between diverged codebases

### Symptoms

- Multiple project instances showing the same tasks/data
- Compile errors about missing or extra struct fields when the codebases have diverged
- Changes in one project appearing in another

### Root Cause

In debug mode, `asset_dir()` resolves to:
```
{CARGO_MANIFEST_DIR}/../../dev_assets
```

Since `CARGO_MANIFEST_DIR` is set at compile time, whichever project last compiled the binary "wins" and all instances use that project's `dev_assets/db.sqlite`.

### Solution

Remove the shared `target-dir` from `.cargo/config.toml` for each independent project clone:

```diff
- [build]
- target-dir = "/Users/someone/projects/vibe-kanban/target"
```

Each project will then use its own local `target/` directory and maintain independent builds and databases.

**Note:** The first build after this change will be slower as it rebuilds from scratch.

### When Shared Target IS Appropriate

The shared target directory optimization is still useful for **git worktrees of the same repository** where the code is identical. It avoids redundant recompilation when switching between branches in worktrees.

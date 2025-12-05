#!/usr/bin/env bash
# Run in login shell to inherit user's environment (asdf, mise, nvm, etc.)
exec ${SHELL:-bash} -lc 'DISABLE_WORKTREE_ORPHAN_CLEANUP=1 RUST_LOG=debug cargo watch -w crates -x "run --bin server"'

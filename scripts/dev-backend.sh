#!/usr/bin/env bash
# Run in login shell to inherit user's environment (asdf, mise, nvm, etc.)
# Pass BACKEND_PORT through to ensure the server uses the allocated port
exec ${SHELL:-bash} -lc "BACKEND_PORT=${BACKEND_PORT:-0} DISABLE_WORKTREE_ORPHAN_CLEANUP=1 RUST_LOG=debug cargo watch -w crates -x 'run --bin server'"

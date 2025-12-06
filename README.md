<p align="center">
  <a href="https://vibekanban.com">
    <img src="frontend/public/hivemind.png" alt="Hivemind Logo" height="64">
  </a>
</p>

<p align="center">Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

## Heavily opinionated fork of [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)

# Changelog

All notable changes to Vibe Kanban.

## [Unreleased]

### Added

#### Features
- **AI-Powered Commit Messages** - Automatically generate commit messages from your staged changes using a large language model. A "Generate" button in the commit dialog calls the AI to create a conventional and descriptive commit message.
- **Advanced Executor Profiles** - The executor profile system has been completely overhauled for more power and flexibility.
  - **Profile Variants:** Define multiple variants for a single executor profile (e.g., a `plan` variant for planning, a `fast` variant for quick tasks).
  - **In-App Profile Editor:** Edit the raw `profiles.json` file directly within the Vibe Kanban settings page.
  - **Fine-Grained Control:** New configuration options for executors, such as `dangerously_skip_permissions`, `yolo` mode, and `claude_code_router`, give you more control over agent behavior.
- **Plan Mode with Manual Approvals** - For supported executors, you can now enable "Plan Mode" to have the AI generate a step-by-step plan for your task.
  - **Interactive Plan Review:** Vibe Kanban will present the plan to you in the conversation view, with each step awaiting your approval.
  - **Approve or Deny:** You can approve or deny each step individually. If you deny a step, you can provide a reason to the AI.
  - **Safety and Control:** This gives you complete control over the execution of the AI's plan, preventing unintended actions.
- **Model Selection** - Users can now select the model to be used for a task.
- **Rebase Stash** - A new feature to stash changes during a rebase.

#### UI Improvements
- **Collapse button in DiffsPanel** - The collapse button in the DiffsPanel has been moved to a safer position to avoid accidental clicks.
- **Selected styling** - Styling for selected items has been improved for better visibility.
- **Mobile View** - The Kanban board is now responsive and usable on mobile devices.
- **Mobile-responsive Kanban board** - Columns stack vertically on screens < 1280px
  - Vertical scrollable layout for status columns on mobile
  - Enhanced visual distinction between sections
  - Better touch targets with increased padding
- **Project status badges** - Display "In Progress" and "Pending Review" counts on project cards
  - Blue badge for tasks in progress
  - Yellow badge for tasks pending review
  - New `ProjectWithTaskCounts` type with database query optimization
- **Executor display on task cards** - Show which AI executor (Claude Code, Gemini, etc.) is assigned
  - Faded text next to task title with brackets and 50% opacity
- **Copy path action** - Copy the current worktree path to clipboard from the Actions dropdown
- **Click-to-open notifications** - Task completion notifications open the task page when clicked
  - macOS: Uses `terminal-notifier` with `-open` flag
  - Linux: Uses `notify-rust` with `xdg-open` action
  - Windows: Toast notification with launch action
- **Settings for git status visibility** - Configure showing git status on task cards
- **Hot code reloading** - Frontend development with instant updates

#### Global Orchestrator
- **Project-wide AI orchestrator** - Coordinate development tasks across your entire codebase
  - Rainbow "VIBE" button in navbar launches orchestrator for any project
  - Full-page orchestrator view with SSE log streaming
  - Start/stop orchestrator with automatic `ORCHESTRATOR.md` loading on first run
  - Send custom prompts to guide orchestrator focus
  - Green pulse indicator shows when orchestrator is running
  - Orchestrator tasks get special handling - skip worktree path creation for project-level work

#### Context Usage Tracking
- **Real-time token usage monitoring** - Track AI agent context window utilization
  - Progress bar shows current context usage with color-coded warning states (70%+, 85%+) 
  - Expandable details panel showing input/output/cached token breakdown
  - Support for cache creation and read tokens in calculations
  - Model-specific context window sizes (Claude 3.5 Sonnet: 200k, etc.)

#### CLI & HTTP API
- **Python CLI (`vibe-cli.py`)** - Full command-line interface for Vibe Kanban
  - Project and task management commands
  - `tasks wait` command to poll until task completes with `--interval` and `--timeout`
  - Automatic hyphen-to-underscore normalization for command routing
- **HTTP API help endpoint** - `/api/tools/vibe-cli/help` documents all REST operations
  - Self-documenting API with method, endpoint, payload examples
  - Equivalent CLI commands listed for each operation
  - Orchestrator endpoints: send prompts, stop execution

#### Compact Feature
- **Compact button for Claude Code** - Minimize conversation context during coding sessions
  - Sends `/compact` command to running Claude Code processes
  - Can start a follow-up with `/compact` as prompt when no agent is running
  - Button only appears when compact is supported (currently Claude Code only)
  - Fixed JSON parsing for Claude Code's `/compact` response format (field aliasing for `sessionid`, `parenttooluseid`)

#### Task Management
- **Reuse existing worktrees** - When a branch is already checked out in a worktree (e.g., the main repo), tasks use that existing directory instead of failing with a conflict error
  - Branch status indicator shows if a branch is already in a worktree
  - Skips worktree cleanup for directories outside managed worktrees dir
  - Enables working on branches already checked out in main repo
### Fixed

- **Task completion not moving to In Review status** - Claude Code executor using bidirectional SDK protocol now properly sends exit signal when task completes
  - Added exit signal to `ProtocolPeer::spawn()` that fires when read_loop completes
  - Fixes exit monitor waiting indefinitely for OS process exit

- **Orchestrator worktree deletion bug** - Critical safety checks prevent orchestrator from deleting main project directory
  - Skip `ensure_worktree_path` for orchestrator tasks in branch status
  - Validate worktree paths before any deletion operations

- **File search cache improvements** - Better caching for file search operations

### Changed

- Executor-aware compact logic - `COMPACT_SUPPORTED_EXECUTORS` set determines button visibility
- Config versioning updated to v9 with new task card display options
- Reduced debug logging noise for orchestrator tasks

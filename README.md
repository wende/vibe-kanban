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

#### Performance

- **Batched Log Writes for Coding Agents** - Optimized database I/O by batching execution process log writes. Buffers up to 100 messages, 10KB, or flushes every 5 seconds. Non-coding-agent executions continue using immediate writes for real-time visibility.
- **react-virtuoso Migration** - Replaced paid `@virtuoso.dev/message-list` with free `react-virtuoso` library for conversation rendering

#### Virtual Terminal

- **Interactive Terminal** - Full PTY-based terminal with xterm.js integration
  - Real terminal sessions within task preview panel
  - Draggable vertical resize handle for terminal/logs pane
  - Dev server logs view integration

#### Core Features

- **AI-Powered Commit Messages** - Automatically generate commit messages from staged changes using AI. A "Generate" button in the commit dialog creates conventional, descriptive commit messages.
- **Advanced Executor Profiles** - Completely overhauled profile system for more power and flexibility
  - **Profile Variants** - Define multiple variants for a single executor (e.g., `plan` for planning, `fast` for quick tasks)
  - **In-App Profile Editor** - Edit `profiles.json` directly within the settings page
  - **Fine-Grained Control** - New options like `dangerously_skip_permissions`, `yolo` mode, and `claude_code_router`
- **Plan Mode with Manual Approvals** - For supported executors, enable "Plan Mode" to have the AI generate step-by-step plans
  - **Interactive Plan Review** - Plans displayed in conversation view, each step awaiting approval
  - **Approve or Deny** - Approve/deny individual steps with optional feedback to the AI
- **Model Selection** - Select which AI model to use for each task
- **Continue with Different Agent** - Switch AI agents mid-conversation while preserving the full conversation history
- **Commit with Custom Name** - Provide custom commit messages when committing
- **Rebase Stash** - Stash changes during a rebase operation

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
  - **Compact Context Counter** - Circular context usage indicator as space-efficient alternative

#### CLI & HTTP API
- **Python CLI (`vibe-cli.py`)** - Full command-line interface for Vibe Kanban
  - Project and task management commands
  - `tasks wait` command to poll until task completes with `--interval` and `--timeout`
  - Automatic hyphen-to-underscore normalization for command routing
- **HTTP API help endpoint** - `/api/tools/vibe-cli/help` documents all REST operations
  - Self-documenting API with method, endpoint, payload examples
  - Equivalent CLI commands listed for each operation
  - Orchestrator endpoints: send prompts, stop execution

#### Task Management

- **Reuse existing worktrees** - When a branch is already checked out in a worktree (e.g., the main repo), tasks use that existing directory instead of failing with a conflict error
  - Branch status indicator shows if a branch is already in a worktree
  - Skips worktree cleanup for directories outside managed worktrees dir
  - Enables working on branches already checked out in main repo
- **Copy Path Action** - Copy worktree path to clipboard from Actions dropdown
- **Push Button** - Replaced Rebase* button with push-to-origin functionality, setting upstream if not established
- **Dev Server Status Indicator** - Visual indicator on task cards showing when a dev server is running

#### UI Improvements
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
  - Linux: Uses notify-rust with `xdg-open` action
  - Windows: Toast notification with launch action

- **Settings for git status visibility** - Configure showing git status on task cards

- **Hot code reloading** - Frontend development with instant updates

- **New Logo** - Custom Hivemind logo replacing original vibe-kanban branding
- **Clear Button** - Clear completed/cancelled tasks with button above Done and Cancelled columns
- **Collapse Button Repositioned** - DiffsPanel collapse button moved away from close button
- **Unread Message Marker** - Visual indicator for unread messages in conversation
- **Unread Notification in Tab Title** - Orange circle appears in browser tab when cards have unread updates
- **Larger Fonts** - All fonts increased by ~10% for better readability
- **Custom Font** - Changed global font for improved aesthetics
- **Removed Column Colors** - Cleaner look without colored column headers
- **Removed Discord Badge** - Cleaner navbar without Discord CTA

#### Commit & PR Improvements

- **Unwrap Generated Commit Messages** - Automatically strips code fences from AI-generated commit messages
- **PR Title Generation Fix** - Uses branch diff instead of uncommitted changes for accurate PR titles
- **Remove (vibe-kanban) from PR Title** - Cleaner PR titles without task reference prefix

### Fixed

- **Task completion not moving to In Review status** - Claude Code executor using bidirectional SDK protocol now properly sends exit signal when task completes
  - Added exit signal to `ProtocolPeer::spawn()` that fires when read_loop completes
  - Fixes exit monitor waiting indefinitely for OS process exit

- **Orchestrator worktree deletion bug** - Critical safety checks prevent orchestrator from deleting main project directory
  - Skip `ensure_worktree_path` for orchestrator tasks in branch status
  - Validate worktree paths before any deletion operations

- **File search cache improvements** - Better caching for file search operations

- **Grabbed Card Z-Index** - Fixed grabbed kanban cards displaying below other cards during drag
- **Local Deployment Issues** - Bug fixes for local deployment functionality
- **Setup Environment** - Fixed environment setup issues
- **Cards Mix Contexts** - Fixed cards incorrectly showing progress of other running tasks due to background cache preloading
- **Sidebar Overlapping Text** - Fixed tool execution output overlapping text in sidebar
- **Card Sidebar Flickering** - Fixed flickering in task card sidebar
- **Context Zeroing** - Fixed Claude Code context being zeroed incorrectly
- **Cursor Jumping** - Fixed cursor position jumping in text inputs
- **Notification Glow** - Restored notification glow animation
- **Loading History** - Fixed slow loading of conversation history
- **Failed to Fetch Projects** - Fixed project fetching errors
- **Double Modals** - Fixed issue with multiple modals appearing
- **Arrow Key Navigation** - Fixed arrow up not working as intended
- **macOS Path Symlinks** - Fixed worktree path comparison on macOS where /var symlinks to /private/var
- **Git Change Not Displayed** - Fixed branch status not displaying for task attempts
- **Commit Window Overflow** - Fixed commit changes window content overflow
- **No Close Button on No Changes** - Fixed missing close button when no changes present
- **Deletes Incorrect Worktrees** - Fixed server attempting to delete worktrees still used by other cards
- **Change Agent Bug** - Fixed issues when switching agents mid-conversation
- **Creating New Card Old Contents** - Fixed new cards showing content from previous cards
- **Minification Error** - Fixed production build minification issues

### Changed

- Config versioning updated to v9 with new task card display options
- Reduced debug logging noise for orchestrator tasks

### Removed

- **Compact button feature** - Removed in favor of upstream's executor architecture
  - The `InputSender` trait and `BoxedInputSender` type were removed
  - Upstream uses `InterruptSender` for graceful executor shutdown instead
  - Compact functionality may be re-implemented in a future version using a different approach

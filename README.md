<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
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

#### CLI Tool
- **Python CLI (`vibe-cli.py`)** - New command-line interface for interacting with Vibe Kanban
  - Full project and task management commands
  - `tasks wait` command to poll until a task completes with configurable `--interval` and `--timeout`
  - Automatic hyphen-to-underscore normalization for command routing (e.g., `tasks create-and-start`)

#### Task Management
- **"Use existing branch" option** - Work on an existing branch instead of creating a new task-specific branch
  - Toggle in task creation dialog
  - Worktree checks out the existing branch instead of creating new one
  - Changes commit directly to the selected branch

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

- **Context usage indicator** - Track AI agent token consumption with visual progress bar
  - Shows input/output/cached tokens
  - Warning levels for approaching context limits

### Fixed

- **Task completion not moving to In Review status** - Claude Code executor using bidirectional SDK protocol now properly sends exit signal when task completes
  - Added exit signal to `ProtocolPeer::spawn()` that fires when read_loop completes
  - Fixes exit monitor waiting indefinitely for OS process exit

- **File search cache improvements** - Better caching for file search operations

### Changed

- Config versioning updated to v9 with new task card display options

### Removed

- **Compact button feature** - Removed in favor of upstream's executor architecture
  - The `InputSender` trait and `BoxedInputSender` type were removed
  - Upstream uses `InterruptSender` for graceful executor shutdown instead
  - Compact functionality may be re-implemented in a future version using a different approach

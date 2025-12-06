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

- **Project-wide AI Orchestrator** - Coordinate development tasks across your entire codebase
  - Rainbow "VIBE" button in navbar launches orchestrator for any project
  - Full-page orchestrator view with SSE log streaming
  - Start/stop orchestrator with automatic `ORCHESTRATOR.md` loading on first run
  - Send custom prompts to guide orchestrator focus
  - Green pulse indicator shows when orchestrator is running
  - Isolated MCP server for orchestrator sessions

#### Context Usage Tracking

- **Real-time Token Usage Monitoring** - Track AI agent context window utilization
  - Progress bar with color-coded warning states (70%+, 85%+)
  - Expandable details showing input/output/cached token breakdown
  - Support for cache creation and read tokens
  - Model-specific context window sizes (Claude 3.5 Sonnet: 200k, etc.)

#### CLI & HTTP API

- **Python CLI (`vibe-cli.py`)** - Full command-line interface for Vibe Kanban
  - Project and task management commands
  - `tasks wait` command to poll until task completes with `--interval` and `--timeout`
  - Automatic hyphen-to-underscore normalization for command routing
- **HTTP API Help Endpoint** - `/api/tools/vibe-cli/help` documents all REST operations
  - Self-documenting API with method, endpoint, payload examples
  - Equivalent CLI commands listed for each operation

#### Task Management

- **Reuse Existing Worktrees** - When a branch is already checked out, tasks use that existing directory
  - Branch status indicator shows worktree status
  - Skip worktree cleanup for directories outside managed worktrees
- **Copy Path Action** - Copy worktree path to clipboard from Actions dropdown

#### UI Improvements

- **New Logo** - Custom Hivemind logo replacing original vibe-kanban branding
- **Mobile-Responsive Kanban Board** - Columns stack vertically on smaller screens
- **Clear Button** - Clear completed/cancelled tasks with button above Done and Cancelled columns
- **Collapse Button Repositioned** - DiffsPanel collapse button moved away from close button
- **Unread Message Marker** - Visual indicator for unread messages in conversation
- **Larger Fonts** - All fonts increased by ~10% for better readability
- **Custom Font** - Changed global font for improved aesthetics
- **Removed Column Colors** - Cleaner look without colored column headers
- **Removed Discord Badge** - Cleaner navbar without Discord CTA

### Fixed

- **Card Sidebar Flickering** - Fixed flickering in task card sidebar
- **Orchestrator Worktree Safety** - Critical checks prevent deleting main project directory
- **Context Zeroing** - Fixed Claude Code context being zeroed incorrectly
- **Cursor Jumping** - Fixed cursor position jumping in text inputs
- **Notification Glow** - Restored notification glow animation
- **Loading History** - Fixed slow loading of conversation history
- **Failed to Fetch Projects** - Fixed project fetching errors
- **Double Modals** - Fixed issue with multiple modals appearing
- **Arrow Key Navigation** - Fixed arrow up not working as intended

### Changed

- **Telemetry Disabled** - Analytics/telemetry turned off by default
- **Onboarding Demo Disabled** - Skip onboarding demo on first run
- **Hot Code Reloading** - Improved frontend development experience
- **Sidebar Loading Optimized** - Faster sidebar loading performance
- **Rebase Defaults** - Better default settings for rebase operations

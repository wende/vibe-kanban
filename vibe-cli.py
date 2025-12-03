#!/usr/bin/env python3
"""
Vibe Kanban CLI - Programmatic interface to Vibe Kanban

Vibe Kanban is an AI-powered Kanban board that automates coding tasks using
AI agents (Claude, Gemini, Cursor, etc.). This CLI provides a command-line
interface to Vibe Kanban's REST API for scripting, automation, and batch operations.

Features:
  • Auto-discovery of running Vibe Kanban servers
  • Manage projects, tasks, attempts, tags, and configuration
  • List available AI executors and their configuration
  • Launch AI agents to execute coding tasks
  • Track task progress through Kanban workflow
  • Create pull requests from completed attempts

Usage:
    vibe <command> [options]
    vibe --help              # Show comprehensive help
    vibe projects --help     # Show help for projects command
    vibe tasks --help        # Show help for tasks command

Quick Examples:
    vibe projects list
    vibe tasks list --project-id <uuid>
    vibe tasks create-and-start --project-id <uuid> --title "Add feature" \\
                                  --executor CLAUDE_CODE --base-branch main
    vibe attempts followup <attempt-id> --prompt "Add tests"

Environment Variables:
    VIBE_API_URL    Explicitly specify API URL (required with multiple servers)

For detailed usage and workflows, run: vibe --help
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlencode, urlparse
from pathlib import Path

DEFAULT_BASE_URL = "http://localhost:3000/api"
REQUEST_TIMEOUT = 30  # seconds


def get_port_file_path():
    """Get the path to the vibe-kanban port file."""
    import tempfile
    return Path(tempfile.gettempdir()) / "vibe-kanban" / "vibe-kanban.port"


def count_running_servers():
    """Count running vibe-kanban server processes using ps."""
    import subprocess
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            timeout=5
        )
        # Look for vibe-kanban processes (both dev and production)
        # Production: macos-arm64/vibe-kanban or dist/vibe-kanban
        # Development: target/debug/server or cargo run --bin server
        lines = [
            line for line in result.stdout.splitlines()
            if ("vibe-kanban" in line and ("dist/" in line or "macos-" in line or "linux-" in line or "windows-" in line))
            or "target/debug/server" in line
            or "target/release/server" in line
            if "grep" not in line and "vibe-cli" not in line and "npm exec" not in line
        ]
        return len(lines)
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
        return 0


def discover_port():
    """Try to discover the server port from the port file."""
    try:
        port_file = get_port_file_path()
        if port_file.exists():
            port = port_file.read_text().strip()
            if port.isdigit():
                return int(port)
    except (IOError, ValueError):
        pass
    return None


def get_base_url():
    """Get the API base URL, with auto-discovery support."""
    # First check explicit env var
    env_url = os.environ.get("VIBE_API_URL")
    if env_url:
        return env_url

    # Try to discover port from port file
    discovered_port = discover_port()
    if discovered_port:
        # Check for multiple running servers
        server_count = count_running_servers()
        if server_count > 1:
            print(f"Error: {server_count} vibe-kanban servers detected!", file=sys.stderr)
            print("", file=sys.stderr)
            print("Cannot auto-discover which server to connect to.", file=sys.stderr)
            print("Please specify the target server explicitly:", file=sys.stderr)
            print("  export VIBE_API_URL=http://127.0.0.1:<port>/api", file=sys.stderr)
            print("", file=sys.stderr)
            print(f"Hint: Port file shows {discovered_port} (most recently started)", file=sys.stderr)
            sys.exit(1)
        return f"http://127.0.0.1:{discovered_port}/api"

    return DEFAULT_BASE_URL


def format_connection_error(base_url):
    """Format a helpful connection error message."""
    parsed = urlparse(base_url)
    port = parsed.port or 80

    lines = [
        f"Connection failed: {base_url}",
        "",
        "Possible causes:",
        f"  1. Server is not running",
        f"  2. Server is running on a different port",
        "",
    ]

    discovered = discover_port()
    if discovered and discovered != port:
        lines.append(f"Hint: Found server port file indicating port {discovered}")
        lines.append(f"      Try: VIBE_API_URL=http://127.0.0.1:{discovered}/api vibe <command>")
        lines.append("")

    lines.append("To specify a custom URL:")
    lines.append("  export VIBE_API_URL=http://127.0.0.1:<port>/api")

    return "\n".join(lines)


def api_request(method, endpoint, data=None, params=None):
    """Make an API request and return JSON response."""
    base_url = get_base_url()
    url = f"{base_url}{endpoint}"
    if params:
        url += "?" + urlencode(params)

    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as response:
            content = response.read().decode()
            return json.loads(content) if content else None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            error_json = json.loads(error_body)
            # Extract meaningful error message
            if isinstance(error_json, dict):
                msg = error_json.get("message") or error_json.get("error") or error_json
                if error_json.get("error_data"):
                    msg = f"{msg}: {error_json['error_data']}"
                print(f"Error {e.code}: {msg}", file=sys.stderr)
            else:
                print(f"Error {e.code}: {json.dumps(error_json, indent=2)}", file=sys.stderr)
        except json.JSONDecodeError:
            print(f"Error {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(format_connection_error(base_url), file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print(f"Request timed out after {REQUEST_TIMEOUT}s", file=sys.stderr)
        print(f"The server at {base_url} may be unresponsive", file=sys.stderr)
        sys.exit(1)


def print_json(data):
    """Pretty print JSON data."""
    print(json.dumps(data, indent=2))


# =============================================================================
# Project Commands
# =============================================================================

def cmd_projects_list(args):
    """List all projects."""
    result = api_request("GET", "/projects")
    print_json(result)


def cmd_projects_get(args):
    """Get a specific project."""
    result = api_request("GET", f"/projects/{args.id}")
    print_json(result)


def cmd_projects_create(args):
    """Create a new project."""
    data = {
        "name": args.name,
        "git_repo_path": args.git_repo_path,
    }
    if args.setup_script:
        data["setup_script"] = args.setup_script
    if args.dev_script:
        data["dev_script"] = args.dev_script
    if args.cleanup_script:
        data["cleanup_script"] = args.cleanup_script

    result = api_request("POST", "/projects", data)
    print_json(result)


def cmd_projects_update(args):
    """Update a project."""
    data = {}
    if args.name:
        data["name"] = args.name
    if args.git_repo_path:
        data["git_repo_path"] = args.git_repo_path
    if args.setup_script:
        data["setup_script"] = args.setup_script
    if args.dev_script:
        data["dev_script"] = args.dev_script
    if args.cleanup_script:
        data["cleanup_script"] = args.cleanup_script

    if not data:
        print("Error: No fields to update specified", file=sys.stderr)
        sys.exit(1)

    result = api_request("PUT", f"/projects/{args.id}", data)
    print_json(result)


def cmd_projects_delete(args):
    """Delete a project."""
    api_request("DELETE", f"/projects/{args.id}")
    print(f"Project {args.id} deleted")


# =============================================================================
# Task Commands
# =============================================================================

def cmd_tasks_list(args):
    """List tasks for a project."""
    params = {"project_id": args.project_id}
    if args.status:
        params["status"] = args.status

    result = api_request("GET", "/tasks", params=params)
    print_json(result)


def cmd_tasks_get(args):
    """Get a specific task."""
    result = api_request("GET", f"/tasks/{args.id}")
    print_json(result)


def cmd_tasks_create(args):
    """Create a new task."""
    data = {
        "project_id": args.project_id,
        "title": args.title,
    }
    if args.description:
        data["description"] = args.description
    if args.status:
        data["status"] = args.status

    result = api_request("POST", "/tasks", data)
    print_json(result)


def cmd_tasks_create_and_start(args):
    """Create a new task and start an attempt immediately."""
    data = {
        "task": {
            "project_id": args.project_id,
            "title": args.title,
            "description": args.description,
            "status": None,
            "parent_task_attempt": None,
            "image_ids": None,
            "shared_task_id": None,
        },
        "executor_profile_id": {"executor": args.executor},
        "base_branch": args.base_branch,
        "use_existing_branch": args.use_existing_branch if hasattr(args, 'use_existing_branch') else False,
        "custom_branch": args.custom_branch if hasattr(args, 'custom_branch') and args.custom_branch else None,
    }

    result = api_request("POST", "/tasks/create-and-start", data)
    print_json(result)


def cmd_tasks_update(args):
    """Update a task."""
    data = {}
    if args.title:
        data["title"] = args.title
    if args.description:
        data["description"] = args.description
    if args.status:
        data["status"] = args.status

    if not data:
        print("Error: No fields to update specified", file=sys.stderr)
        sys.exit(1)

    result = api_request("PUT", f"/tasks/{args.id}", data)
    print_json(result)


def cmd_tasks_delete(args):
    """Delete a task."""
    api_request("DELETE", f"/tasks/{args.id}")
    print(f"Task {args.id} deleted")


def cmd_tasks_wait(args):
    """Wait for a task to transition from in-progress to another state."""
    import time

    poll_interval = args.interval
    timeout = args.timeout
    start_time = time.time()

    # Get initial task state
    result = api_request("GET", f"/tasks/{args.id}")
    task = result.get("data", result)
    initial_status = task.get("status")

    if initial_status != "inprogress":
        print(f"Task is not in-progress (current status: {initial_status})", file=sys.stderr)
        print_json(result)
        return

    print(f"Waiting for task {args.id} to complete...", file=sys.stderr)
    print(f"Current status: {initial_status}", file=sys.stderr)

    while True:
        # Check timeout
        elapsed = time.time() - start_time
        if timeout and elapsed >= timeout:
            print(f"Timeout after {timeout} seconds", file=sys.stderr)
            sys.exit(1)

        time.sleep(poll_interval)

        # Poll task status
        result = api_request("GET", f"/tasks/{args.id}")
        task = result.get("data", result)
        current_status = task.get("status")

        if current_status != "inprogress":
            print(f"Task completed with status: {current_status}", file=sys.stderr)
            print_json(result)
            return


# =============================================================================
# Task Attempt Commands
# =============================================================================

def cmd_attempts_list(args):
    """List attempts for a task."""
    result = api_request("GET", f"/tasks/{args.task_id}")
    if result and "attempts" in result:
        print_json(result["attempts"])
    else:
        print_json([])


def cmd_attempts_create(args):
    """Create a new task attempt."""
    data = {
        "task_id": args.task_id,
        "executor_profile_id": {"executor": args.executor},
        "base_branch": args.base_branch,
        "custom_branch": args.custom_branch if hasattr(args, 'custom_branch') and args.custom_branch else None,
    }

    result = api_request("POST", "/task-attempts", data)
    print_json(result)


def cmd_attempts_followup(args):
    """Send a follow-up prompt to an attempt."""
    data = {"prompt": args.prompt}
    if args.variant:
        data["variant"] = args.variant

    result = api_request("POST", f"/task-attempts/{args.id}/follow-up", data)
    print_json(result)


def cmd_attempts_stop(args):
    """Stop an attempt execution."""
    result = api_request("POST", f"/task-attempts/{args.id}/stop")
    print_json(result) if result else print(f"Attempt {args.id} stopped")


def cmd_attempts_merge(args):
    """Merge an attempt's changes."""
    result = api_request("POST", f"/task-attempts/{args.id}/merge")
    print_json(result) if result else print(f"Attempt {args.id} merged")


def cmd_attempts_push(args):
    """Push an attempt's branch."""
    endpoint = f"/task-attempts/{args.id}/push"
    if args.force:
        endpoint += "/force"
    result = api_request("POST", endpoint)
    print_json(result) if result else print(f"Attempt {args.id} pushed")


def cmd_attempts_pr(args):
    """Create a pull request for an attempt."""
    data = {"title": args.title}
    if args.body:
        data["body"] = args.body
    if args.target_branch:
        data["target_branch"] = args.target_branch

    result = api_request("POST", f"/task-attempts/{args.id}/pr", data)
    print_json(result)


# =============================================================================
# Tag Commands
# =============================================================================

def cmd_tags_list(args):
    """List all tags."""
    result = api_request("GET", "/tags")
    print_json(result)


def cmd_tags_create(args):
    """Create a new tag."""
    data = {"tag_name": args.name}
    if args.content:
        data["content"] = args.content

    result = api_request("POST", "/tags", data)
    print_json(result)


def cmd_tags_update(args):
    """Update a tag."""
    data = {}
    if args.name:
        data["tag_name"] = args.name
    if args.content:
        data["content"] = args.content

    result = api_request("PUT", f"/tags/{args.id}", data)
    print_json(result)


def cmd_tags_delete(args):
    """Delete a tag."""
    api_request("DELETE", f"/tags/{args.id}")
    print(f"Tag {args.id} deleted")


# =============================================================================
# Config Commands
# =============================================================================

def cmd_config_get(args):
    """Get current configuration."""
    result = api_request("GET", "/config")
    print_json(result)


def cmd_config_update(args):
    """Update configuration."""
    data = {}
    if args.git_branch_prefix:
        data["git_branch_prefix"] = args.git_branch_prefix
    if args.editor:
        data["editor"] = args.editor
    if args.analytics_enabled is not None:
        data["analytics_enabled"] = args.analytics_enabled

    result = api_request("PUT", "/config", data)
    print_json(result)


# =============================================================================
# Executors Commands
# =============================================================================

def cmd_executors_list(args):
    """List all available executors and their configuration."""
    result = api_request("GET", "/info")

    # Extract executors from the response
    if "data" in result and "executors" in result["data"]:
        executors = result["data"]["executors"]
        print_json({"executors": executors})
    else:
        print_json(result)


# =============================================================================
# Main CLI Setup
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="""Vibe Kanban CLI - Programmatic interface to Vibe Kanban

WHAT IS VIBE KANBAN?
  Vibe Kanban is an AI-powered Kanban board that automates coding tasks using
  AI agents (Claude, Gemini, Cursor, etc.). It manages git worktrees, executes
  tasks in isolated branches, tracks progress in real-time, and integrates with
  GitHub for pull requests and deployment.

WHAT DOES THIS CLI DO?
  This tool provides a command-line interface to Vibe Kanban's REST API, allowing
  you to programmatically manage:

  • Projects: Define codebases with setup/dev/cleanup scripts
  • Tasks: Create and track work items across todo/in-progress/in-review/done
  • Attempts: Launch AI agents to execute tasks with different executors
  • Tags: Organize and categorize tasks
  • Config: Manage git branch prefixes, editor, and analytics settings
  • Executors: List available AI executors and their configuration

  The CLI is useful for scripting, automation, CI/CD integration, and batch
  operations across multiple tasks or projects.

SERVER AUTO-DISCOVERY:
  The CLI automatically discovers running Vibe Kanban servers by reading the
  port file at: /tmp/vibe-kanban/vibe-kanban.port

  If multiple servers are detected, you must explicitly specify which one to
  connect to using the VIBE_API_URL environment variable.""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
ENVIRONMENT VARIABLES:
  VIBE_API_URL    Explicitly specify API base URL (e.g., http://127.0.0.1:50492/api)
                  Required when multiple Vibe Kanban servers are running.
                  Optional when single server is running (auto-discovery will work).

COMMON WORKFLOWS:

  1. List projects and their tasks:
     %(prog)s projects list
     %(prog)s tasks list --project-id <uuid>

  2. Create a task and start it immediately (recommended):
     %(prog)s tasks create-and-start --project-id <uuid> --title "Add authentication" \\
                                      --description "Implement OAuth2" \\
                                      --executor CLAUDE_CODE --base-branch main

  3. Or create task and attempt separately (for more control):
     %(prog)s tasks create --project-id <uuid> --title "Add feature"
     %(prog)s attempts create --task-id <uuid> --executor CLAUDE_CODE --base-branch main

  4. Send follow-up instructions to a running attempt:
     %(prog)s attempts followup <attempt-id> --prompt "Add unit tests for auth flow"

  5. Move task through workflow:
     %(prog)s tasks update <task-id> --status in-progress
     %(prog)s tasks update <task-id> --status in-review
     %(prog)s tasks update <task-id> --status done

  6. Create PR from completed attempt:
     %(prog)s attempts push <attempt-id>
     %(prog)s attempts pr <attempt-id> --title "Add OAuth2 authentication" \\
                                        --body "Closes #123"

  7. Batch delete all done tasks:
     %(prog)s tasks list --project-id <uuid> --status done | jq -r '.data[].id' | \\
       xargs -I {} %(prog)s tasks delete {}

TIPS:
  • Use 'jq' to parse JSON output for scripting
  • Task and project IDs are UUIDs
  • Executors: CLAUDE_CODE, GEMINI, CURSOR_AGENT, CODEX, OPENCODE
  • Task statuses: todo, in-progress, in-review, done, cancelled

For more information, visit: https://github.com/vibe-teams/vibe-kanban
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # -------------------------------------------------------------------------
    # Projects
    # -------------------------------------------------------------------------
    projects_parser = subparsers.add_parser("projects", help="Manage projects")
    projects_sub = projects_parser.add_subparsers(dest="subcommand")

    # projects list
    projects_sub.add_parser("list", help="List all projects")

    # projects get
    p = projects_sub.add_parser("get", help="Get a project")
    p.add_argument("id", help="Project ID (UUID)")

    # projects create
    p = projects_sub.add_parser("create", help="Create a project")
    p.add_argument("--name", required=True, help="Project name")
    p.add_argument("--git-repo-path", required=True, help="Path to git repository")
    p.add_argument("--setup-script", help="Setup script to run")
    p.add_argument("--dev-script", help="Dev server script")
    p.add_argument("--cleanup-script", help="Cleanup script")

    # projects update
    p = projects_sub.add_parser("update", help="Update a project")
    p.add_argument("id", help="Project ID (UUID)")
    p.add_argument("--name", help="New project name")
    p.add_argument("--git-repo-path", help="New git repo path")
    p.add_argument("--setup-script", help="Setup script")
    p.add_argument("--dev-script", help="Dev server script")
    p.add_argument("--cleanup-script", help="Cleanup script")

    # projects delete
    p = projects_sub.add_parser("delete", help="Delete a project")
    p.add_argument("id", help="Project ID (UUID)")

    # -------------------------------------------------------------------------
    # Tasks
    # -------------------------------------------------------------------------
    tasks_parser = subparsers.add_parser("tasks", help="Manage tasks")
    tasks_sub = tasks_parser.add_subparsers(dest="subcommand")

    # tasks list
    p = tasks_sub.add_parser("list", help="List tasks")
    p.add_argument("--project-id", required=True, help="Project ID (UUID)")
    p.add_argument("--status", choices=["todo", "in-progress", "in-review", "done", "cancelled"],
                   help="Filter by status")

    # tasks get
    p = tasks_sub.add_parser("get", help="Get a task")
    p.add_argument("id", help="Task ID (UUID)")

    # tasks create
    p = tasks_sub.add_parser("create", help="Create a task")
    p.add_argument("--project-id", required=True, help="Project ID (UUID)")
    p.add_argument("--title", required=True, help="Task title")
    p.add_argument("--description", help="Task description")
    p.add_argument("--status", choices=["todo", "in-progress", "in-review", "done", "cancelled"],
                   default="todo", help="Initial status (default: todo)")

    # tasks create-and-start
    p = tasks_sub.add_parser("create-and-start", help="Create a task and start an attempt immediately")
    p.add_argument("--project-id", required=True, help="Project ID (UUID)")
    p.add_argument("--title", required=True, help="Task title")
    p.add_argument("--description", help="Task description")
    p.add_argument("--executor", required=True,
                   choices=["CLAUDE_CODE", "CODEX", "GEMINI", "CURSOR_AGENT", "OPENCODE"],
                   help="Executor to use")
    p.add_argument("--base-branch", required=True, help="Base branch name")
    p.add_argument("--custom-branch", help="Custom branch name (optional, overrides auto-generated branch)")
    p.add_argument("--use-existing-branch", action="store_true",
                   help="Use base branch as working branch instead of creating a new one")

    # tasks update
    p = tasks_sub.add_parser("update", help="Update a task")
    p.add_argument("id", help="Task ID (UUID)")
    p.add_argument("--title", help="New title")
    p.add_argument("--description", help="New description")
    p.add_argument("--status", choices=["todo", "in-progress", "in-review", "done", "cancelled"],
                   help="New status")

    # tasks delete
    p = tasks_sub.add_parser("delete", help="Delete a task")
    p.add_argument("id", help="Task ID (UUID)")

    # tasks wait
    p = tasks_sub.add_parser("wait", help="Wait for a task to transition from in-progress to another state")
    p.add_argument("id", help="Task ID (UUID)")
    p.add_argument("--interval", type=float, default=2.0,
                   help="Polling interval in seconds (default: 2.0)")
    p.add_argument("--timeout", type=float, default=None,
                   help="Timeout in seconds (default: no timeout)")

    # -------------------------------------------------------------------------
    # Attempts
    # -------------------------------------------------------------------------
    attempts_parser = subparsers.add_parser("attempts", help="Manage task attempts")
    attempts_sub = attempts_parser.add_subparsers(dest="subcommand")

    # attempts list
    p = attempts_sub.add_parser("list", help="List attempts for a task")
    p.add_argument("--task-id", required=True, help="Task ID (UUID)")

    # attempts create
    p = attempts_sub.add_parser("create", help="Create a task attempt")
    p.add_argument("--task-id", required=True, help="Task ID (UUID)")
    p.add_argument("--executor", required=True,
                   choices=["CLAUDE_CODE", "CODEX", "GEMINI", "CURSOR_AGENT", "OPENCODE"],
                   help="Executor to use")
    p.add_argument("--base-branch", required=True, help="Base branch name")
    p.add_argument("--custom-branch", help="Custom branch name (optional, overrides auto-generated branch)")

    # attempts followup
    p = attempts_sub.add_parser("followup", help="Send follow-up prompt")
    p.add_argument("id", help="Attempt ID (UUID)")
    p.add_argument("--prompt", required=True, help="Follow-up prompt")
    p.add_argument("--variant", help="Variant identifier")

    # attempts stop
    p = attempts_sub.add_parser("stop", help="Stop an attempt")
    p.add_argument("id", help="Attempt ID (UUID)")

    # attempts merge
    p = attempts_sub.add_parser("merge", help="Merge attempt changes")
    p.add_argument("id", help="Attempt ID (UUID)")

    # attempts push
    p = attempts_sub.add_parser("push", help="Push attempt branch")
    p.add_argument("id", help="Attempt ID (UUID)")
    p.add_argument("--force", action="store_true", help="Force push")

    # attempts pr
    p = attempts_sub.add_parser("pr", help="Create pull request")
    p.add_argument("id", help="Attempt ID (UUID)")
    p.add_argument("--title", required=True, help="PR title")
    p.add_argument("--body", help="PR body/description")
    p.add_argument("--target-branch", help="Target branch for PR")

    # -------------------------------------------------------------------------
    # Tags
    # -------------------------------------------------------------------------
    tags_parser = subparsers.add_parser("tags", help="Manage tags")
    tags_sub = tags_parser.add_subparsers(dest="subcommand")

    # tags list
    tags_sub.add_parser("list", help="List all tags")

    # tags create
    p = tags_sub.add_parser("create", help="Create a tag")
    p.add_argument("--name", required=True, help="Tag name (no spaces)")
    p.add_argument("--content", help="Tag content")

    # tags update
    p = tags_sub.add_parser("update", help="Update a tag")
    p.add_argument("id", help="Tag ID (UUID)")
    p.add_argument("--name", help="New tag name")
    p.add_argument("--content", help="New content")

    # tags delete
    p = tags_sub.add_parser("delete", help="Delete a tag")
    p.add_argument("id", help="Tag ID (UUID)")

    # -------------------------------------------------------------------------
    # Config
    # -------------------------------------------------------------------------
    config_parser = subparsers.add_parser("config", help="Manage configuration")
    config_sub = config_parser.add_subparsers(dest="subcommand")

    # config get
    config_sub.add_parser("get", help="Get current config")

    # config update
    p = config_sub.add_parser("update", help="Update config")
    p.add_argument("--git-branch-prefix", help="Git branch prefix")
    p.add_argument("--editor", help="Editor command")
    p.add_argument("--analytics-enabled", type=lambda x: x.lower() == "true",
                   help="Enable analytics (true/false)")

    # -------------------------------------------------------------------------
    # Executors
    # -------------------------------------------------------------------------
    executors_parser = subparsers.add_parser("executors", help="List available executors and their configuration")
    executors_sub = executors_parser.add_subparsers(dest="subcommand")

    # executors list
    executors_sub.add_parser("list", help="List all available executors")

    # -------------------------------------------------------------------------
    # Parse and dispatch
    # -------------------------------------------------------------------------
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Build command handler name
    if hasattr(args, "subcommand") and args.subcommand:
        # Normalize hyphens to underscores for handler lookup
        subcommand = args.subcommand.replace("-", "_")
        handler_name = f"cmd_{args.command}_{subcommand}"
    else:
        # Show subcommand help if no subcommand given
        subparser = subparsers.choices.get(args.command)
        if subparser:
            subparser.print_help()
        sys.exit(1)

    # Get and call handler
    handler = globals().get(handler_name)
    if handler:
        handler(args)
    else:
        print(f"Unknown command: {args.command} {args.subcommand}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

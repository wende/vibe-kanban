use axum::{Router, response::Json as ResponseJson, routing::get};
use serde::Serialize;
use serde_json::json;
use utils::response::ApiResponse;

use crate::DeploymentImpl;

#[derive(Debug, Serialize)]
pub struct HelpCommand {
    pub name: &'static str,
    pub summary: &'static str,
    pub method: &'static str,
    pub endpoint: &'static str,
    pub payload_example: Option<serde_json::Value>,
    pub equivalent_cli: &'static str,
    pub notes: Option<&'static str>,
}

#[derive(Debug, Serialize)]
pub struct HelpExample {
    pub title: &'static str,
    pub steps: Vec<&'static str>,
    pub curl: &'static str,
}

#[derive(Debug, Serialize)]
pub struct VibeCliHelpResponse {
    pub title: &'static str,
    pub description: &'static str,
    pub usage: Vec<&'static str>,
    pub environment: Vec<&'static str>,
    pub commands: Vec<HelpCommand>,
    pub examples: Vec<HelpExample>,
}

pub async fn vibe_cli_help() -> ResponseJson<ApiResponse<VibeCliHelpResponse>> {
    let commands = vec![
        HelpCommand {
            name: "projects.list",
            summary: "List all projects and their IDs",
            method: "GET",
            endpoint: "/api/projects",
            payload_example: None,
            equivalent_cli: "vibe projects list",
            notes: None,
        },
        HelpCommand {
            name: "projects.create",
            summary: "Create a project from an existing repository",
            method: "POST",
            endpoint: "/api/projects",
            payload_example: Some(json!({
                "name": "My Project",
                "repo_path": "/Users/me/src/my-project"
            })),
            equivalent_cli: "vibe projects create --name \"My Project\" --repo-path /path/to/repo",
            notes: Some("repo_path must be an absolute path on the host running Vibe Kanban"),
        },
        HelpCommand {
            name: "tasks.list",
            summary: "List tasks for a project",
            method: "GET",
            endpoint: "/api/projects/{project_id}/tasks",
            payload_example: None,
            equivalent_cli: "vibe tasks list --project-id <uuid>",
            notes: None,
        },
        HelpCommand {
            name: "tasks.create",
            summary: "Create a task and optional starting attempt",
            method: "POST",
            endpoint: "/api/tasks",
            payload_example: Some(json!({
                "project_id": "<project_uuid>",
                "title": "Add feature",
                "description": "Details go here"
            })),
            equivalent_cli: "vibe tasks create --project-id <uuid> --title \"Add feature\"",
            notes: Some(
                "Set \"executor\" and other fields if you want to start an attempt immediately",
            ),
        },
        HelpCommand {
            name: "tasks.start_attempt",
            summary: "Start an executor attempt on an existing task",
            method: "POST",
            endpoint: "/api/tasks/{task_id}/attempts",
            payload_example: Some(json!({
                "executor": "CLAUDE_CODE",
                "base_branch": "main",
                "branch": "feature/add-feature"
            })),
            equivalent_cli: "vibe tasks start --task-id <uuid> --executor CLAUDE_CODE",
            notes: Some("branch/base_branch follow the same semantics used in the CLI"),
        },
        HelpCommand {
            name: "orchestrator.send",
            summary: "Start or continue the global orchestrator for a project",
            method: "POST",
            endpoint: "/api/projects/{project_id}/orchestrator/send",
            payload_example: Some(json!({
                "prompt": "Review recent commits and file TODOs."
            })),
            equivalent_cli: "vibe orchestrator send --project-id <uuid> --prompt \"...\"",
            notes: Some("Omit prompt on the first call to load ORCHESTRATOR.md automatically"),
        },
        HelpCommand {
            name: "orchestrator.stop",
            summary: "Stop the orchestrator's active execution",
            method: "POST",
            endpoint: "/api/projects/{project_id}/orchestrator/stop",
            payload_example: None,
            equivalent_cli: "vibe orchestrator stop --project-id <uuid>",
            notes: None,
        },
    ];

    let examples = vec![
        HelpExample {
            title: "List projects using curl",
            steps: vec![
                "curl -s http://127.0.0.1:3000/api/projects",
                "jq to pretty-print JSON if desired",
            ],
            curl: "curl -s http://127.0.0.1:3000/api/projects | jq",
        },
        HelpExample {
            title: "Create a task and immediately start the orchestrator",
            steps: vec![
                "POST /api/tasks with project_id/title/description",
                "POST /api/projects/{project_id}/orchestrator/send with a prompt or rely on ORCHESTRATOR.md",
            ],
            curl: "curl -s -X POST http://127.0.0.1:3000/api/projects/<project>/orchestrator/send -H 'Content-Type: application/json' -d '{\"prompt\":\"Review outstanding tasks\"}'",
        },
    ];

    let usage = vec![
        "GET /api/tools/vibe-cli/help  -> this document",
        "Combine with VIBE_API_URL or BACKEND_PORT if the API is not on localhost:3000",
        "Send requests using curl, HTTPie, or any HTTP client instead of invoking python vibe-cli.py",
    ];

    let environment = vec![
        "VIBE_API_URL overrides the target API base (default: http://127.0.0.1:3000/api)",
        "BACKEND_PORT is honored by the dev server; combine with localhost to build the URL manually",
    ];

    let response = VibeCliHelpResponse {
        title: "Vibe CLI HTTP Help",
        description: "Use these HTTP endpoints to accomplish everything previously handled by vibe-cli.py.",
        usage,
        environment,
        commands,
        examples,
    };

    ResponseJson(ApiResponse::success(response))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/tools/vibe-cli/help", get(vibe_cli_help))
}

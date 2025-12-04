use axum::{
    Json, Router,
    extract::State,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    project::Project,
    task::Task,
    task_attempt::{CreateTaskAttempt, TaskAttempt},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
    },
    executors::BaseCodingAgent,
    profile::ExecutorProfileId,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Response type for orchestrator endpoints
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OrchestratorResponse {
    pub task: Task,
    pub attempt: TaskAttempt,
    /// The latest execution process for the orchestrator (if any)
    pub latest_process: Option<ExecutionProcess>,
}

/// Request body for sending a message to the orchestrator
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct OrchestratorSendRequest {
    /// Optional prompt - if not provided on initial start, will read from ORCHESTRATOR.md
    pub prompt: Option<String>,
    /// Optional variant override (e.g., "opus", "sonnet")
    pub variant: Option<String>,
    /// Force a new session (ignore existing session and start fresh)
    #[serde(default)]
    pub force_new_session: bool,
}

/// Get the orchestrator for a project (creates if none exists)
#[axum::debug_handler]
pub async fn get_orchestrator(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(project_id): axum::extract::Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<OrchestratorResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify project exists
    let project = Project::find_by_id(pool, project_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get or create the orchestrator task
    let task = Task::get_or_create_orchestrator(pool, project_id).await?;

    // Check if there's an existing orchestrator attempt
    let existing_attempt = TaskAttempt::find_orchestrator_by_project_id(pool, project_id).await?;

    let attempt = if let Some(attempt) = existing_attempt {
        attempt
    } else {
        // Get current branch from repo (orchestrator operates on whatever branch is checked out)
        let current_branch = deployment
            .git()
            .get_current_branch(&project.git_repo_path)
            .unwrap_or_else(|_| "main".to_string());

        // Create a new orchestrator attempt
        let attempt_id = Uuid::new_v4();
        let attempt = TaskAttempt::create(
            pool,
            &CreateTaskAttempt {
                executor: BaseCodingAgent::ClaudeCode,
                base_branch: current_branch.clone(),
                branch: current_branch, // Orchestrator works on current branch
                is_orchestrator: true,
            },
            attempt_id,
            task.id,
        )
        .await?;

        // Set container_ref to project's git_repo_path
        let container_ref = project.git_repo_path.to_string_lossy().to_string();
        TaskAttempt::update_container_ref(pool, attempt.id, &container_ref).await?;

        // Reload to get updated attempt
        TaskAttempt::find_by_id(pool, attempt.id)
            .await?
            .ok_or(SqlxError::RowNotFound)?
    };

    // Get latest process for this attempt
    let latest_process = ExecutionProcess::find_latest_by_task_attempt(pool, attempt.id).await?;

    Ok(ResponseJson(ApiResponse::success(OrchestratorResponse {
        task,
        attempt,
        latest_process,
    })))
}

/// Send a message to the orchestrator (starts or resumes a session)
#[axum::debug_handler]
pub async fn orchestrator_send(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(project_id): axum::extract::Path<Uuid>,
    Json(payload): Json<OrchestratorSendRequest>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify project exists
    let project = Project::find_by_id(pool, project_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get the orchestrator (must exist to send a message)
    let attempt = TaskAttempt::find_orchestrator_by_project_id(pool, project_id)
        .await?
        .ok_or_else(|| {
            ApiError::BadRequest("Orchestrator not initialized. Call GET first.".to_string())
        })?;

    // Check if there's already a running process
    let running_processes =
        ExecutionProcess::find_by_task_attempt_id(pool, attempt.id, false).await?;
    let has_running = running_processes
        .iter()
        .any(|p| p.status == db::models::execution_process::ExecutionProcessStatus::Running);

    if has_running {
        return Err(ApiError::BadRequest(
            "Orchestrator already has a running process. Stop it first or wait for completion."
                .to_string(),
        ));
    }

    // Build executor profile
    let executor_profile_id = ExecutorProfileId {
        executor: BaseCodingAgent::ClaudeCode,
        variant: payload.variant,
    };

    // Check for existing session to resume (unless force_new_session is true)
    let latest_session_id = if payload.force_new_session {
        None
    } else {
        ExecutionProcess::find_latest_session_id_by_task_attempt(pool, attempt.id).await?
    };
    let is_resume = latest_session_id.is_some();

    // Determine the prompt to use
    let prompt = if let Some(_session_id) = &latest_session_id {
        // For resume, prompt is required
        payload.prompt.ok_or_else(|| {
            ApiError::BadRequest("prompt is required for follow-up messages".to_string())
        })?
    } else {
        // For new session, try to read ORCHESTRATOR.md if no prompt provided
        if let Some(p) = payload.prompt {
            p
        } else {
            let orchestrator_file = project.git_repo_path.join("ORCHESTRATOR.md");
            match std::fs::read_to_string(&orchestrator_file) {
                Ok(contents) => contents,
                Err(_) => {
                    // Use the default ORCHESTRATOR.md embedded at compile time
                    include_str!("../../../../ORCHESTRATOR.md").to_string()
                }
            }
        }
    };

    let action_type = if let Some(session_id) = latest_session_id {
        // Resume existing session
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt,
            session_id,
            executor_profile_id: executor_profile_id.clone(),
        })
    } else {
        // Start new session
        ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
            prompt,
            executor_profile_id: executor_profile_id.clone(),
        })
    };

    // No cleanup action for orchestrator - it operates directly on main
    let action = ExecutorAction::new(action_type, None);

    let execution_process = deployment
        .container()
        .start_execution(&attempt, &action, &ExecutionProcessRunReason::CodingAgent)
        .await?;

    deployment
        .track_if_analytics_allowed(
            "orchestrator_message_sent",
            serde_json::json!({
                "project_id": project_id.to_string(),
                "attempt_id": attempt.id.to_string(),
                "is_resume": is_resume,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

/// Stop the orchestrator's running process
#[axum::debug_handler]
pub async fn orchestrator_stop(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(project_id): axum::extract::Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get the orchestrator attempt
    let attempt = TaskAttempt::find_orchestrator_by_project_id(pool, project_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Orchestrator not found".to_string()))?;

    // Stop all running processes for this attempt
    deployment.container().try_stop(&attempt).await;

    deployment
        .track_if_analytics_allowed(
            "orchestrator_stopped",
            serde_json::json!({
                "project_id": project_id.to_string(),
                "attempt_id": attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/projects/{project_id}/orchestrator", get(get_orchestrator))
        .route(
            "/projects/{project_id}/orchestrator/send",
            post(orchestrator_send),
        )
        .route(
            "/projects/{project_id}/orchestrator/stop",
            post(orchestrator_stop),
        )
}

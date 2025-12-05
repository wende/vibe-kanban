use std::time::Duration;

use db::{
    DBService,
    models::{
        merge::{Merge, MergeStatus, PrMerge},
        task::{Task, TaskStatus},
        task_attempt::{TaskAttempt, TaskAttemptError},
    },
};
use serde_json::json;
use sqlx::error::Error as SqlxError;
use thiserror::Error;
use tokio::{sync::watch, time::interval};
use tracing::{debug, error, info};

use crate::services::{
    analytics::AnalyticsContext,
    github::{GitHubRepoInfo, GitHubService, GitHubServiceError},
    share::SharePublisher,
};

#[derive(Debug, Error)]
enum PrMonitorError {
    #[error(transparent)]
    GitHubServiceError(#[from] GitHubServiceError),
    #[error(transparent)]
    TaskAttemptError(#[from] TaskAttemptError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
}

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    db: DBService,
    poll_interval: Duration,
    analytics: Option<AnalyticsContext>,
    publisher: Option<SharePublisher>,
}

/// Handle to control the PR monitor service
pub struct PrMonitorHandle {
    shutdown_tx: watch::Sender<bool>,
    join_handle: tokio::task::JoinHandle<()>,
}

impl PrMonitorHandle {
    /// Request the PR monitor service to shutdown
    pub fn request_shutdown(&self) {
        let _ = self.shutdown_tx.send(true);
    }

    /// Request shutdown and wait for the service to stop
    pub async fn shutdown(self) {
        self.request_shutdown();
        if let Err(e) = self.join_handle.await {
            tracing::warn!("PR monitor task join failed: {:?}", e);
        }
    }
}

impl PrMonitorService {
    pub async fn spawn(
        db: DBService,
        analytics: Option<AnalyticsContext>,
        publisher: Option<SharePublisher>,
    ) -> PrMonitorHandle {
        let service = Self {
            db,
            poll_interval: Duration::from_secs(60), // Check every minute
            analytics,
            publisher,
        };
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let join_handle = tokio::spawn(async move {
            service.start(shutdown_rx).await;
        });
        PrMonitorHandle {
            shutdown_tx,
            join_handle,
        }
    }

    async fn start(&self, mut shutdown_rx: watch::Receiver<bool>) {
        info!(
            "Starting PR monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        info!("PR monitoring service received shutdown signal");
                        break;
                    }
                }
                _ = interval.tick() => {
                    if let Err(e) = self.check_all_open_prs().await {
                        error!("Error checking open PRs: {}", e);
                    }
                }
            }
        }
        info!("PR monitoring service stopped");
    }

    /// Check all open PRs for updates with the provided GitHub token
    async fn check_all_open_prs(&self) -> Result<(), PrMonitorError> {
        let open_prs = Merge::get_open_prs(&self.db.pool).await?;

        if open_prs.is_empty() {
            debug!("No open PRs to check");
            return Ok(());
        }

        info!("Checking {} open PRs", open_prs.len());

        for pr_merge in open_prs {
            if let Err(e) = self.check_pr_status(&pr_merge).await {
                error!(
                    "Error checking PR #{} for attempt {}: {}",
                    pr_merge.pr_info.number, pr_merge.task_attempt_id, e
                );
            }
        }
        Ok(())
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_merge: &PrMerge) -> Result<(), PrMonitorError> {
        // GitHubService now uses gh CLI, no token needed
        let github_service = GitHubService::new()?;
        let repo_info = GitHubRepoInfo::from_remote_url(&pr_merge.pr_info.url)?;

        let pr_status = github_service
            .update_pr_status(&repo_info, pr_merge.pr_info.number)
            .await?;

        debug!(
            "PR #{} status: {:?} (was open)",
            pr_merge.pr_info.number, pr_status.status
        );

        // Update the PR status in the database
        if !matches!(&pr_status.status, MergeStatus::Open) {
            // Update merge status with the latest information from GitHub
            Merge::update_status(
                &self.db.pool,
                pr_merge.id,
                pr_status.status.clone(),
                pr_status.merge_commit_sha,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if matches!(&pr_status.status, MergeStatus::Merged)
                && let Some(task_attempt) =
                    TaskAttempt::find_by_id(&self.db.pool, pr_merge.task_attempt_id).await?
            {
                info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_merge.pr_info.number, task_attempt.task_id
                );
                Task::update_status(&self.db.pool, task_attempt.task_id, TaskStatus::Done).await?;

                // Track analytics event
                if let Some(analytics) = &self.analytics
                    && let Ok(Some(task)) =
                        Task::find_by_id(&self.db.pool, task_attempt.task_id).await
                {
                    analytics.analytics_service.track_event(
                        &analytics.user_id,
                        "pr_merged",
                        Some(json!({
                            "task_id": task_attempt.task_id.to_string(),
                            "task_attempt_id": task_attempt.id.to_string(),
                            "project_id": task.project_id.to_string(),
                        })),
                    );
                }

                if let Some(publisher) = &self.publisher
                    && let Err(err) = publisher
                        .update_shared_task_by_id(task_attempt.task_id)
                        .await
                {
                    tracing::warn!(
                        ?err,
                        "Failed to propagate shared task update for {}",
                        task_attempt.task_id
                    );
                }
            }
        }

        Ok(())
    }
}

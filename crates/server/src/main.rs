use anyhow::{self, Error as AnyhowError};
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, routes};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
    browser::open_browser,
    port_file::write_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

#[derive(Debug, Error)]
pub enum VibeKanbanError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[tokio::main]
async fn main() -> Result<(), VibeKanbanError> {
    sentry_utils::init_once(SentrySource::Backend);

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level}",
        level = log_level
    );
    let env_filter = EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(env_filter))
        .with(sentry_layer())
        .init();

    // Create asset directory if it doesn't exist
    if !asset_dir().exists() {
        std::fs::create_dir_all(asset_dir())?;
    }

    let deployment = DeploymentImpl::new().await?;
    deployment.update_sentry_scope().await?;
    deployment
        .container()
        .cleanup_orphan_executions()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_before_head_commits()
        .await
        .map_err(DeploymentError::from)?;
    let pr_monitor_handle = deployment.spawn_pr_monitor_service().await;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;
    // Pre-warm file search cache for most active projects
    let deployment_for_cache = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_cache
            .file_search_cache()
            .warm_most_active(&deployment_for_cache.db().pool, 3)
            .await
        {
            tracing::warn!("Failed to warm file search cache: {}", e);
        }
    });

    // Verify shared tasks in background
    let deployment_for_verification = deployment.clone();
    tokio::spawn(async move {
        if let Some(publisher) = deployment_for_verification.container().share_publisher()
            && let Err(e) = publisher.cleanup_shared_tasks().await
        {
            tracing::warn!("Failed to verify shared tasks: {}", e);
        }
    });

    let app_router = routes::router(deployment.clone());

    let port = std::env::var("BACKEND_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| {
            // remove any ANSI codes, then turn into String
            let cleaned =
                String::from_utf8(strip(s.as_bytes())).expect("UTF-8 after stripping ANSI");
            cleaned.trim().parse::<u16>().ok()
        })
        .unwrap_or_else(|| {
            tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
            0
        }); // Use 0 to find free port if no specific port provided

    // Bind to both IPv4 and IPv6 localhost to avoid connection delays.
    // On macOS, clients using "localhost" try IPv6 (::1) first, then fall back to IPv4 (127.0.0.1).
    // If we only bind to IPv4, clients experience ~30s delay waiting for IPv6 to timeout.
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

    // First bind to IPv4 to get the actual port
    let ipv4_listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    let actual_port = ipv4_listener.local_addr()?.port();

    // Try to also bind to IPv6 on the same port (best-effort, may fail on some systems)
    let ipv6_listener = tokio::net::TcpListener::bind(format!("[::1]:{actual_port}")).await.ok();
    if ipv6_listener.is_some() {
        tracing::debug!("Bound to both IPv4 and IPv6 on port {}", actual_port);
    } else {
        tracing::debug!("IPv6 bind failed (normal on some systems), using IPv4 only");
    }

    // Write port file for discovery if prod, warn on fail
    if let Err(e) = write_port_file(actual_port).await {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!("Server running on http://{host}:{actual_port}");

    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        tokio::spawn(async move {
            if let Err(e) = open_browser(&format!("http://127.0.0.1:{actual_port}")).await {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    actual_port
                );
            }
        });
    }

    // Serve on both listeners (IPv6 in background if available)
    let ipv6_task = if let Some(ipv6_l) = ipv6_listener {
        let ipv6_router = app_router.clone();
        Some(tokio::spawn(async move {
            if let Err(e) = axum::serve(ipv6_l, ipv6_router).await {
                tracing::warn!("IPv6 server error: {}", e);
            }
        }))
    } else {
        None
    };

    axum::serve(ipv4_listener, app_router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    // Abort IPv6 server when IPv4 shuts down
    if let Some(task) = ipv6_task {
        task.abort();
    }

    perform_cleanup_actions(&deployment, pr_monitor_handle).await;

    Ok(())
}

pub async fn shutdown_signal() {
    // Always wait for Ctrl+C
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("Failed to install Ctrl+C handler: {e}");
        }
    };

    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        // Try to install SIGTERM handler, but don't panic if it fails
        let terminate = async {
            if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
                sigterm.recv().await;
            } else {
                tracing::error!("Failed to install SIGTERM handler");
                // Fallback: never resolves
                std::future::pending::<()>().await;
            }
        };

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }
    }

    #[cfg(not(unix))]
    {
        // Only ctrl_c is available, so just await it
        ctrl_c.await;
    }
}

pub async fn perform_cleanup_actions(
    deployment: &DeploymentImpl,
    pr_monitor_handle: services::services::pr_monitor::PrMonitorHandle,
) {
    tracing::info!("Shutting down background services...");

    // Signal worktree cleanup to stop
    deployment.container().request_worktree_cleanup_shutdown();

    // Shutdown PR monitor service
    pr_monitor_handle.shutdown().await;

    // Kill all running execution processes
    deployment
        .container()
        .kill_all_running_processes()
        .await
        .expect("Failed to cleanly kill running execution processes");

    tracing::info!("Cleanup complete");
}

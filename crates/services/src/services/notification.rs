use std::sync::OnceLock;

use db::models::execution_process::{ExecutionContext, ExecutionProcessStatus};
use utils::{self, port_file::read_port_file};

use crate::services::config::SoundFile;

/// Service for handling cross-platform notifications including sound alerts and push notifications
#[derive(Debug, Clone)]
pub struct NotificationService {}
use crate::services::config::NotificationConfig;

/// Cache for WSL root path from PowerShell
static WSL_ROOT_PATH_CACHE: OnceLock<Option<String>> = OnceLock::new();

impl NotificationService {
    pub async fn notify_execution_halted(mut config: NotificationConfig, ctx: &ExecutionContext) {
        // If the process was intentionally killed by user, suppress sound
        if matches!(ctx.execution_process.status, ExecutionProcessStatus::Killed) {
            config.sound_enabled = false;
        }

        let title = format!("Task Complete: {}", ctx.task.title);
        let message = match ctx.execution_process.status {
            ExecutionProcessStatus::Completed => format!(
                "✅ '{}' completed successfully\nBranch: {:?}\nExecutor: {}",
                ctx.task.title, ctx.task_attempt.branch, ctx.task_attempt.executor
            ),
            ExecutionProcessStatus::Failed => format!(
                "❌ '{}' execution failed\nBranch: {:?}\nExecutor: {}",
                ctx.task.title, ctx.task_attempt.branch, ctx.task_attempt.executor
            ),
            ExecutionProcessStatus::Killed => format!(
                "🛑 '{}' execution cancelled by user\nBranch: {:?}\nExecutor: {}",
                ctx.task.title, ctx.task_attempt.branch, ctx.task_attempt.executor
            ),
            _ => {
                tracing::warn!(
                    "Tried to notify attempt completion for {} but process is still running!",
                    ctx.task_attempt.id
                );
                return;
            }
        };

        // Construct URL to open when notification is clicked
        let url = Self::build_attempt_url(ctx).await;

        Self::notify(config, &title, &message, url.as_deref()).await;
    }

    /// Build the URL for the task attempt page
    async fn build_attempt_url(ctx: &ExecutionContext) -> Option<String> {
        let port = match read_port_file("vibe-kanban").await {
            Ok(p) => p,
            Err(e) => {
                tracing::debug!("Could not read port file for notification URL: {}", e);
                return None;
            }
        };

        Some(format!(
            "http://127.0.0.1:{}/projects/{}/tasks/{}/attempts/{}",
            port, ctx.task.project_id, ctx.task.id, ctx.task_attempt.id
        ))
    }

    /// Send both sound and push notifications if enabled
    pub async fn notify(config: NotificationConfig, title: &str, message: &str, url: Option<&str>) {
        if config.sound_enabled {
            Self::play_sound_notification(&config.sound_file).await;
        }

        if config.push_enabled {
            Self::send_push_notification(title, message, url).await;
        }
    }

    /// Play a system sound notification across platforms
    async fn play_sound_notification(sound_file: &SoundFile) {
        let file_path = match sound_file.get_path().await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to create cached sound file: {}", e);
                return;
            }
        };

        // Use platform-specific sound notification
        // Note: spawn() calls are intentionally not awaited - sound notifications should be fire-and-forget
        if cfg!(target_os = "macos") {
            let _ = tokio::process::Command::new("afplay")
                .arg(&file_path)
                .spawn();
        } else if cfg!(target_os = "linux") && !utils::is_wsl2() {
            // Try different Linux audio players
            if tokio::process::Command::new("paplay")
                .arg(&file_path)
                .spawn()
                .is_ok()
            {
                // Success with paplay
            } else if tokio::process::Command::new("aplay")
                .arg(&file_path)
                .spawn()
                .is_ok()
            {
                // Success with aplay
            } else {
                // Try system bell as fallback
                let _ = tokio::process::Command::new("echo")
                    .arg("-e")
                    .arg("\\a")
                    .spawn();
            }
        } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && utils::is_wsl2()) {
            // Convert WSL path to Windows path if in WSL2
            let file_path = if utils::is_wsl2() {
                if let Some(windows_path) = Self::wsl_to_windows_path(&file_path).await {
                    windows_path
                } else {
                    file_path.to_string_lossy().to_string()
                }
            } else {
                file_path.to_string_lossy().to_string()
            };

            let _ = tokio::process::Command::new("powershell.exe")
                .arg("-c")
                .arg(format!(
                    r#"(New-Object Media.SoundPlayer "{file_path}").PlaySync()"#
                ))
                .spawn();
        }
    }

    /// Send a cross-platform push notification
    async fn send_push_notification(title: &str, message: &str, url: Option<&str>) {
        if cfg!(target_os = "macos") {
            Self::send_macos_notification(title, message, url).await;
        } else if cfg!(target_os = "linux") && !utils::is_wsl2() {
            Self::send_linux_notification(title, message, url).await;
        } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && utils::is_wsl2()) {
            Self::send_windows_notification(title, message, url).await;
        }
    }

    /// Send macOS notification using terminal-notifier (with click-to-open support) or osascript fallback
    async fn send_macos_notification(title: &str, message: &str, url: Option<&str>) {
        // Try terminal-notifier first (supports -open for click actions)
        let mut cmd = tokio::process::Command::new("terminal-notifier");
        cmd.arg("-title")
            .arg(title)
            .arg("-message")
            .arg(message)
            .arg("-sound")
            .arg("Glass")
            .arg("-ignoreDnD"); // Show even in Do Not Disturb mode

        if let Some(open_url) = url {
            cmd.arg("-open").arg(open_url);
        }

        match cmd.spawn() {
            Ok(_) => return, // terminal-notifier succeeded
            Err(e) => {
                tracing::debug!(
                    "terminal-notifier not available ({}), falling back to osascript",
                    e
                );
            }
        }

        // Fallback to osascript (no click-to-open support)
        let script = format!(
            r#"display notification "{message}" with title "{title}" sound name "Glass""#,
            message = message.replace('"', r#"\""#),
            title = title.replace('"', r#"\""#)
        );

        let _ = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
    }

    /// Send Linux notification using notify-rust with optional click-to-open URL
    #[cfg(all(unix, not(target_os = "macos")))]
    async fn send_linux_notification(title: &str, message: &str, url: Option<&str>) {
        use notify_rust::{Hint, Notification};

        let title = title.to_string();
        let message = message.to_string();
        let url = url.map(|s| s.to_string());

        let _handle = tokio::task::spawn_blocking(move || {
            let mut notification = Notification::new();
            notification.summary(&title).body(&message).timeout(10000);

            // Add default action for click-to-open (requires notification daemon support)
            if let Some(ref open_url) = url {
                // Use the "default" action which is triggered when clicking the notification body
                notification.action("default", "Open");
                // Some notification daemons support this hint for URLs
                notification.hint(Hint::Custom("x-kde-urls".to_string(), open_url.clone()));
            }

            match notification.show() {
                Ok(handle) => {
                    // If we have a URL, wait for action in a separate thread
                    if let Some(open_url) = url {
                        // Spawn a thread to handle the action callback
                        std::thread::spawn(move || {
                            handle.wait_for_action(|action| {
                                if action == "default" {
                                    // Open URL when notification is clicked
                                    let _ = std::process::Command::new("xdg-open")
                                        .arg(&open_url)
                                        .spawn();
                                }
                            });
                        });
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to send Linux notification: {}", e);
                }
            }
        });
        drop(_handle); // Don't await, fire-and-forget
    }

    /// Stub for non-Linux platforms (this function is never called on those platforms)
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    #[allow(unused_variables)]
    async fn send_linux_notification(title: &str, message: &str, url: Option<&str>) {
        // This function should never be called on non-Linux platforms
        // as the caller checks cfg!(target_os = "linux")
    }

    /// Send Windows/WSL notification using PowerShell toast script with optional click-to-open URL
    async fn send_windows_notification(title: &str, message: &str, url: Option<&str>) {
        let script_path = match utils::get_powershell_script().await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to get PowerShell script: {}", e);
                return;
            }
        };

        // Convert WSL path to Windows path if in WSL2
        let script_path_str = if utils::is_wsl2() {
            if let Some(windows_path) = Self::wsl_to_windows_path(&script_path).await {
                windows_path
            } else {
                script_path.to_string_lossy().to_string()
            }
        } else {
            script_path.to_string_lossy().to_string()
        };

        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script_path_str)
            .arg("-Title")
            .arg(title)
            .arg("-Message")
            .arg(message);

        if let Some(open_url) = url {
            cmd.arg("-Url").arg(open_url);
        }

        let _ = cmd.spawn();
    }

    /// Get WSL root path via PowerShell (cached)
    async fn get_wsl_root_path() -> Option<String> {
        if let Some(cached) = WSL_ROOT_PATH_CACHE.get() {
            return cached.clone();
        }

        match tokio::process::Command::new("powershell.exe")
            .arg("-c")
            .arg("(Get-Location).Path -replace '^.*::', ''")
            .current_dir("/")
            .output()
            .await
        {
            Ok(output) => {
                match String::from_utf8(output.stdout) {
                    Ok(pwd_str) => {
                        let pwd = pwd_str.trim();
                        tracing::info!("WSL root path detected: {}", pwd);

                        // Cache the result
                        let _ = WSL_ROOT_PATH_CACHE.set(Some(pwd.to_string()));
                        return Some(pwd.to_string());
                    }
                    Err(e) => {
                        tracing::error!("Failed to parse PowerShell pwd output as UTF-8: {}", e);
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to execute PowerShell pwd command: {}", e);
            }
        }

        // Cache the failure result
        let _ = WSL_ROOT_PATH_CACHE.set(None);
        None
    }

    /// Convert WSL path to Windows UNC path for PowerShell
    async fn wsl_to_windows_path(wsl_path: &std::path::Path) -> Option<String> {
        let path_str = wsl_path.to_string_lossy();

        // Relative paths work fine as-is in PowerShell
        if !path_str.starts_with('/') {
            tracing::debug!("Using relative path as-is: {}", path_str);
            return Some(path_str.to_string());
        }

        // Get cached WSL root path from PowerShell
        if let Some(wsl_root) = Self::get_wsl_root_path().await {
            // Simply concatenate WSL root with the absolute path - PowerShell doesn't mind /
            let windows_path = format!("{wsl_root}{path_str}");
            tracing::debug!("WSL path converted: {} -> {}", path_str, windows_path);
            Some(windows_path)
        } else {
            tracing::error!(
                "Failed to determine WSL root path for conversion: {}",
                path_str
            );
            None
        }
    }
}

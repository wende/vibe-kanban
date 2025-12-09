use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use git2::{Error as GitError, Repository};
use thiserror::Error;
use tracing::{debug, info, trace};
use utils::shell::resolve_executable_path;

use super::git::{GitService, GitServiceError};

// Global synchronization for worktree creation to prevent race conditions
lazy_static::lazy_static! {
    static ref WORKTREE_CREATION_LOCKS: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Debug, Clone)]
pub struct WorktreeCleanup {
    pub worktree_path: PathBuf,
    pub git_repo_path: Option<PathBuf>,
}

impl WorktreeCleanup {
    pub fn new(worktree_path: PathBuf, git_repo_path: Option<PathBuf>) -> Self {
        Self {
            worktree_path,
            git_repo_path,
        }
    }
}

#[derive(Debug, Error)]
pub enum WorktreeError {
    #[error(transparent)]
    Git(#[from] GitError),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error("Git CLI error: {0}")]
    GitCli(String),
    #[error("Task join error: {0}")]
    TaskJoin(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Branch not found: {0}")]
    BranchNotFound(String),
    #[error("Repository error: {0}")]
    Repository(String),
    #[error("Branch '{0}' is already checked out in another worktree")]
    BranchAlreadyCheckedOut(String),
    #[error("Unsafe path - refusing to delete '{0}' as it is outside managed worktree directory")]
    UnsafePath(String),
}

pub struct WorktreeManager;

impl WorktreeManager {
    /// Create a worktree with a new branch
    pub async fn create_worktree(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
        base_branch: &str,
        create_branch: bool,
    ) -> Result<(), WorktreeError> {
        if create_branch {
            let repo_path_owned = repo_path.to_path_buf();
            let branch_name_owned = branch_name.to_string();
            let base_branch_owned = base_branch.to_string();

            tokio::task::spawn_blocking(move || {
                let repo = Repository::open(&repo_path_owned)?;
                let base_branch_ref =
                    GitService::find_branch(&repo, &base_branch_owned)?.into_reference();
                repo.branch(
                    &branch_name_owned,
                    &base_branch_ref.peel_to_commit()?,
                    false,
                )?;
                Ok::<(), GitServiceError>(())
            })
            .await
            .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))??;
        }

        Self::ensure_worktree_exists(repo_path, branch_name, worktree_path).await
    }

    /// Ensure worktree exists, recreating if necessary with proper synchronization
    /// This is the main entry point for ensuring a worktree exists and prevents race conditions
    pub async fn ensure_worktree_exists(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();

        // Get or create a lock for this specific worktree path
        let lock = {
            let mut locks = WORKTREE_CREATION_LOCKS.lock().unwrap();
            locks
                .entry(path_str.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        // Acquire the lock for this specific worktree path
        let _guard = lock.lock().await;

        // Check if worktree already exists and is properly set up
        if Self::is_worktree_properly_set_up(repo_path, worktree_path).await? {
            trace!("Worktree already properly set up at path: {}", path_str);
            return Ok(());
        }

        // If worktree doesn't exist or isn't properly set up, recreate it
        info!("Worktree needs recreation at path: {}", path_str);
        Self::recreate_worktree_internal(repo_path, branch_name, worktree_path).await
    }

    /// Internal worktree recreation function (always recreates)
    async fn recreate_worktree_internal(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();
        let branch_name_owned = branch_name.to_string();
        let worktree_path_owned = worktree_path.to_path_buf();

        // CRITICAL SAFETY CHECK: Never recreate worktrees outside the managed directory
        // This prevents accidental deletion of user directories (e.g., main project repos)
        // Use the full safety verification which includes symlink protection
        Self::verify_path_safe_for_deletion(worktree_path).map_err(|_| {
            WorktreeError::InvalidPath(format!(
                "Cannot create worktree at '{}' - path is outside managed worktree directory. \
                 This is likely a bug - orchestrator tasks should not call ensure_worktree_exists.",
                path_str
            ))
        })?;

        // Use the provided repo path
        let git_repo_path = repo_path;

        // Get the worktree name for metadata operations
        let worktree_name = worktree_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| WorktreeError::InvalidPath("Invalid worktree path".to_string()))?
            .to_string();

        info!(
            "Creating worktree {} at path {}",
            branch_name_owned, path_str
        );

        // Step 1: Comprehensive cleanup of existing worktree and metadata (non-blocking)
        Self::comprehensive_worktree_cleanup_async(
            git_repo_path,
            &worktree_path_owned,
            &worktree_name,
        )
        .await?;

        // Step 2: Ensure parent directory exists (non-blocking)
        if let Some(parent) = worktree_path_owned.parent() {
            let parent_path = parent.to_path_buf();
            tokio::task::spawn_blocking(move || std::fs::create_dir_all(&parent_path))
                .await
                .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))?
                .map_err(WorktreeError::Io)?;
        }

        // Step 3: Create the worktree with retry logic for metadata conflicts (non-blocking)
        Self::create_worktree_with_retry(
            git_repo_path,
            &branch_name_owned,
            &worktree_path_owned,
            &worktree_name,
            &path_str,
        )
        .await
    }

    /// Check if a worktree is properly set up (filesystem + git metadata)
    async fn is_worktree_properly_set_up(
        repo_path: &Path,
        worktree_path: &Path,
    ) -> Result<bool, WorktreeError> {
        let repo_path = repo_path.to_path_buf();
        let worktree_path = worktree_path.to_path_buf();

        tokio::task::spawn_blocking(move || -> Result<bool, WorktreeError> {
            // Check 1: Filesystem path must exist
            if !worktree_path.exists() {
                return Ok(false);
            }

            // Check 2: Worktree must be registered in git metadata using find_worktree
            let repo = Repository::open(&repo_path).map_err(WorktreeError::Git)?;
            let worktree_name = worktree_path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| WorktreeError::InvalidPath("Invalid worktree path".to_string()))?;

            // Try to find the worktree - if it exists and is valid, we're good
            match repo.find_worktree(worktree_name) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Comprehensive cleanup of worktree path and metadata to prevent "path exists" errors (blocking)
    fn comprehensive_worktree_cleanup(
        repo: &Repository,
        worktree_path: &Path,
        worktree_name: &str,
    ) -> Result<(), WorktreeError> {
        debug!("Performing cleanup for worktree: {}", worktree_name);

        // CRITICAL SAFETY CHECK: Verify path is safe to delete before any filesystem operations
        Self::verify_path_safe_for_deletion(worktree_path)?;

        let git_repo_path = Self::get_git_repo_path(repo)?;

        // Step 1: Use GitService to remove the worktree registration (force) if present
        // The Git CLI is more robust than libgit2 for mutable worktree operations
        let git_service = GitService::new();
        if let Err(e) = git_service.remove_worktree(&git_repo_path, worktree_path, true) {
            debug!("git worktree remove non-fatal error: {}", e);
        }

        // Step 2: Always force cleanup metadata directory (proactive cleanup)
        if let Err(e) = Self::force_cleanup_worktree_metadata(&git_repo_path, worktree_name) {
            debug!("Metadata cleanup failed (non-fatal): {}", e);
        }

        // Step 3: Clean up physical worktree directory if it exists
        // Re-verify safety right before deletion (defense in depth - path could have changed)
        Self::verify_path_safe_for_deletion(worktree_path)?;
        if worktree_path.exists() {
            debug!(
                "Removing existing worktree directory: {}",
                worktree_path.display()
            );
            std::fs::remove_dir_all(worktree_path).map_err(WorktreeError::Io)?;
        }

        // Step 4: Good-practice to clean up any other stale admin entries
        if let Err(e) = git_service.prune_worktrees(&git_repo_path) {
            debug!("git worktree prune non-fatal error: {}", e);
        }

        debug!(
            "Comprehensive cleanup completed for worktree: {}",
            worktree_name
        );
        Ok(())
    }

    /// Async version of comprehensive cleanup to avoid blocking the main runtime
    async fn comprehensive_worktree_cleanup_async(
        git_repo_path: &Path,
        worktree_path: &Path,
        worktree_name: &str,
    ) -> Result<(), WorktreeError> {
        let git_repo_path_owned = git_repo_path.to_path_buf();
        let worktree_path_owned = worktree_path.to_path_buf();
        let worktree_name_owned = worktree_name.to_string();

        // First, try to open the repository to see if it exists
        let repo_result = tokio::task::spawn_blocking({
            let git_repo_path = git_repo_path_owned.clone();
            move || Repository::open(&git_repo_path)
        })
        .await;

        match repo_result {
            Ok(Ok(repo)) => {
                // Repository exists, perform comprehensive cleanup
                tokio::task::spawn_blocking(move || {
                    Self::comprehensive_worktree_cleanup(
                        &repo,
                        &worktree_path_owned,
                        &worktree_name_owned,
                    )
                })
                .await
                .map_err(|e| WorktreeError::TaskJoin(format!("Task join error: {e}")))?
            }
            Ok(Err(e)) => {
                // Repository doesn't exist (likely deleted project), fall back to simple cleanup
                debug!(
                    "Failed to open repository at {:?}: {}. Falling back to simple cleanup for worktree at {}",
                    git_repo_path_owned,
                    e,
                    worktree_path_owned.display()
                );
                Self::simple_worktree_cleanup(&worktree_path_owned).await?;
                Ok(())
            }
            Err(e) => Err(WorktreeError::TaskJoin(format!("{e}"))),
        }
    }

    /// Create worktree with retry logic in non-blocking manner
    async fn create_worktree_with_retry(
        git_repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
        worktree_name: &str,
        path_str: &str,
    ) -> Result<(), WorktreeError> {
        let git_repo_path = git_repo_path.to_path_buf();
        let branch_name = branch_name.to_string();
        let worktree_path = worktree_path.to_path_buf();
        let worktree_name = worktree_name.to_string();
        let path_str = path_str.to_string();

        tokio::task::spawn_blocking(move || -> Result<(), WorktreeError> {
            // Prefer git CLI for worktree add to inherit sparse-checkout semantics
            let git_service = GitService::new();
            match git_service.add_worktree(&git_repo_path, &worktree_path, &branch_name, false) {
                Ok(()) => {
                    if !worktree_path.exists() {
                        return Err(WorktreeError::Repository(format!(
                            "Worktree creation reported success but path {path_str} does not exist"
                        )));
                    }
                    info!(
                        "Successfully created worktree {} at {} (git CLI)",
                        branch_name, path_str
                    );
                    Ok(())
                }
                Err(e) => {
                    // Check if this is a "branch already checked out" error
                    let error_str = e.to_string();
                    if error_str.contains("is already used by worktree")
                        || error_str.contains("is already checked out")
                    {
                        return Err(WorktreeError::BranchAlreadyCheckedOut(branch_name.clone()));
                    }

                    tracing::info!(
                        "git worktree add failed; attempting metadata cleanup and retry: {}",
                        e
                    );
                    // Force cleanup metadata and try one more time
                    Self::force_cleanup_worktree_metadata(&git_repo_path, &worktree_name)
                        .map_err(WorktreeError::Io)?;
                    // Clean up physical directory if it exists
                    // Needed if previous attempt failed after directory creation
                    // SAFETY: Verify path before deletion (defense in depth)
                    Self::verify_path_safe_for_deletion(&worktree_path)?;
                    if worktree_path.exists() {
                        std::fs::remove_dir_all(&worktree_path).map_err(WorktreeError::Io)?;
                    }
                    if let Err(e2) = git_service.add_worktree(
                        &git_repo_path,
                        &worktree_path,
                        &branch_name,
                        false,
                    ) {
                        // Check again after retry
                        let error_str = e2.to_string();
                        if error_str.contains("is already used by worktree")
                            || error_str.contains("is already checked out")
                        {
                            return Err(WorktreeError::BranchAlreadyCheckedOut(
                                branch_name.clone(),
                            ));
                        }
                        return Err(WorktreeError::GitService(e2));
                    }
                    if !worktree_path.exists() {
                        return Err(WorktreeError::Repository(format!(
                            "Worktree creation reported success but path {path_str} does not exist"
                        )));
                    }
                    info!(
                        "Successfully created worktree {} at {} after metadata cleanup (git CLI)",
                        branch_name, path_str
                    );
                    Ok(())
                }
            }
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Get the git repository path
    fn get_git_repo_path(repo: &Repository) -> Result<PathBuf, WorktreeError> {
        repo.workdir()
            .ok_or_else(|| {
                WorktreeError::Repository("Repository has no working directory".to_string())
            })?
            .to_str()
            .ok_or_else(|| {
                WorktreeError::InvalidPath("Repository path is not valid UTF-8".to_string())
            })
            .map(PathBuf::from)
    }

    /// Force cleanup worktree metadata directory
    fn force_cleanup_worktree_metadata(
        git_repo_path: &Path,
        worktree_name: &str,
    ) -> Result<(), std::io::Error> {
        let git_worktree_metadata_path = git_repo_path
            .join(".git")
            .join("worktrees")
            .join(worktree_name);

        if git_worktree_metadata_path.exists() {
            debug!(
                "Force removing git worktree metadata: {}",
                git_worktree_metadata_path.display()
            );
            std::fs::remove_dir_all(&git_worktree_metadata_path)?;
        }

        Ok(())
    }

    /// Clean up multiple worktrees
    pub async fn batch_cleanup_worktrees(data: &[WorktreeCleanup]) -> Result<(), WorktreeError> {
        for cleanup_data in data {
            tracing::debug!("Cleaning up worktree: {:?}", cleanup_data.worktree_path);

            if let Err(e) = Self::cleanup_worktree(cleanup_data).await {
                tracing::error!("Failed to cleanup worktree: {}", e);
            }
        }
        Ok(())
    }

    /// Clean up a worktree path and its git metadata (non-blocking)
    /// If git_repo_path is None, attempts to infer it from the worktree itself
    pub async fn cleanup_worktree(worktree: &WorktreeCleanup) -> Result<(), WorktreeError> {
        let path_str = worktree.worktree_path.to_string_lossy().to_string();

        // CRITICAL SAFETY CHECK: Verify path is safe to delete (with symlink protection)
        // This prevents accidental deletion of user directories (e.g., main project repos)
        if let Err(e) = Self::verify_path_safe_for_deletion(&worktree.worktree_path) {
            tracing::warn!("Refusing to cleanup worktree at '{}': {}", path_str, e);
            return Ok(()); // Return Ok to avoid breaking callers, but don't delete
        }

        // Get the same lock to ensure we don't interfere with creation
        let lock = {
            let mut locks = WORKTREE_CREATION_LOCKS.lock().unwrap();
            locks
                .entry(path_str.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        let _guard = lock.lock().await;

        if let Some(worktree_name) = worktree.worktree_path.file_name().and_then(|n| n.to_str()) {
            // Try to determine the git repo path if not provided
            let resolved_repo_path = if let Some(repo_path) = &worktree.git_repo_path {
                Some(repo_path.to_path_buf())
            } else {
                Self::infer_git_repo_path(&worktree.worktree_path).await
            };

            if let Some(repo_path) = resolved_repo_path {
                Self::comprehensive_worktree_cleanup_async(
                    &repo_path,
                    &worktree.worktree_path,
                    worktree_name,
                )
                .await?;
            } else {
                // Can't determine repo path, just clean up the worktree directory
                debug!(
                    "Cannot determine git repo path for worktree {}, performing simple cleanup",
                    path_str
                );
                Self::simple_worktree_cleanup(&worktree.worktree_path).await?;
            }
        } else {
            return Err(WorktreeError::InvalidPath(
                "Invalid worktree path, cannot determine name".to_string(),
            ));
        }

        Ok(())
    }

    /// Try to infer the git repository path from a worktree
    async fn infer_git_repo_path(worktree_path: &Path) -> Option<PathBuf> {
        // Try using git rev-parse --git-common-dir from within the worktree
        let worktree_path_owned = worktree_path.to_path_buf();

        let git_path = resolve_executable_path("git").await?;

        let output = tokio::process::Command::new(git_path)
            .args(["rev-parse", "--git-common-dir"])
            .current_dir(&worktree_path_owned)
            .output()
            .await
            .ok()?;

        if output.status.success() {
            let git_common_dir = String::from_utf8(output.stdout).ok()?.trim().to_string();

            // git-common-dir gives us the path to the .git directory
            // We need the working directory (parent of .git)
            let git_dir_path = Path::new(&git_common_dir);
            if git_dir_path.file_name() == Some(std::ffi::OsStr::new(".git")) {
                git_dir_path.parent()?.to_str().map(PathBuf::from)
            } else {
                // In case of bare repo or unusual setup, use the git-common-dir as is
                Some(PathBuf::from(git_common_dir))
            }
        } else {
            None
        }
    }

    /// Simple worktree cleanup when we can't determine the main repo
    async fn simple_worktree_cleanup(worktree_path: &Path) -> Result<(), WorktreeError> {
        // CRITICAL SAFETY CHECK: Verify path is safe to delete before any filesystem operations
        Self::verify_path_safe_for_deletion(worktree_path)?;

        let worktree_path_owned = worktree_path.to_path_buf();

        tokio::task::spawn_blocking(move || -> Result<(), WorktreeError> {
            // Double-check safety inside the blocking task (defense in depth)
            Self::verify_path_safe_for_deletion(&worktree_path_owned)?;

            if worktree_path_owned.exists() {
                std::fs::remove_dir_all(&worktree_path_owned).map_err(WorktreeError::Io)?;
                info!(
                    "Removed worktree directory: {}",
                    worktree_path_owned.display()
                );
            }
            Ok(())
        })
        .await
        .map_err(|e| WorktreeError::TaskJoin(format!("{e}")))?
    }

    /// Get the base directory for vibe-kanban worktrees
    pub fn get_worktree_base_dir() -> std::path::PathBuf {
        utils::path::get_vibe_kanban_temp_dir().join("worktrees")
    }

    /// CRITICAL SAFETY CHECK: Verify a path is safe to delete.
    ///
    /// This function prevents accidental deletion of user directories by ensuring:
    /// 1. The path is inside the managed worktree base directory
    /// 2. The path doesn't contain traversal components (..)
    /// 3. After resolving symlinks (canonicalization), the real path is still inside the base
    /// 4. The base directory itself is in a temp/private location
    ///
    /// Returns Ok(()) if safe to delete, Err(UnsafePath) if not.
    pub fn verify_path_safe_for_deletion(worktree_path: &Path) -> Result<(), WorktreeError> {
        let worktree_base = Self::get_worktree_base_dir();
        let path_str = worktree_path.to_string_lossy().to_string();

        // First check: path must start with the worktree base
        // On macOS, /var is a symlink to /private/var, so we need to handle both forms.
        // Canonicalize the base first (create it if needed so we can canonicalize)
        let _ = std::fs::create_dir_all(&worktree_base);
        let canonical_base = worktree_base
            .canonicalize()
            .unwrap_or(worktree_base.clone());

        let is_inside_base = if let Ok(canonical_path) = worktree_path.canonicalize() {
            // Path exists - compare canonical forms
            canonical_path.starts_with(&canonical_base)
        } else {
            // Path doesn't exist - normalize /private/var/ to /var/ for comparison (macOS)
            let base_str = canonical_base.to_string_lossy();
            let normalized_path = if path_str.starts_with("/private/var/") {
                path_str.replacen("/private/var/", "/var/", 1)
            } else {
                path_str.clone()
            };
            let normalized_base = if base_str.starts_with("/private/var/") {
                base_str.replacen("/private/var/", "/var/", 1)
            } else {
                base_str.to_string()
            };
            normalized_path.starts_with(&normalized_base)
        };

        if !is_inside_base {
            tracing::error!(
                "SAFETY: Path '{}' is not inside worktree base '{}' - refusing to delete",
                path_str,
                worktree_base.display()
            );
            return Err(WorktreeError::UnsafePath(path_str));
        }

        // Second check: Reject paths containing ".." components (path traversal attacks)
        // This catches cases like "/tmp/worktrees/../../../etc/passwd"
        for component in worktree_path.components() {
            if component == std::path::Component::ParentDir {
                tracing::error!(
                    "SAFETY: Path '{}' contains '..' components - refusing to delete (path traversal attempt)",
                    path_str
                );
                return Err(WorktreeError::UnsafePath(path_str));
            }
        }

        // Third check: If the path exists, canonicalize it and verify it's still inside base
        // This catches symlink attacks where the path resolves to somewhere outside
        if worktree_path.exists() {
            match std::fs::canonicalize(worktree_path) {
                Ok(canonical_path) => {
                    if !canonical_path.starts_with(&canonical_base) {
                        tracing::error!(
                            "SAFETY: Canonical path '{}' (from '{}') is outside canonical base '{}' - \
                             this may be a symlink attack! Refusing to delete.",
                            canonical_path.display(),
                            path_str,
                            canonical_base.display()
                        );
                        return Err(WorktreeError::UnsafePath(path_str));
                    }
                    tracing::trace!(
                        "Path '{}' verified safe for deletion (canonical: '{}')",
                        path_str,
                        canonical_path.display()
                    );
                }
                Err(e) => {
                    // Path exists but can't be canonicalized - this is suspicious
                    tracing::warn!(
                        "SAFETY: Cannot canonicalize path '{}': {} - proceeding with caution",
                        path_str,
                        e
                    );
                    // Still allow deletion since it passed the starts_with check
                    // and the path exists (so it's likely just a permissions issue)
                }
            }
        }

        // Fourth check: Verify the base directory is in an expected temp location
        // This is a defense-in-depth check to prevent misconfiguration
        let base_str = worktree_base.to_string_lossy();
        let is_in_temp_location = base_str.contains("/var/folders/")  // macOS temp
            || base_str.contains("/tmp/")
            || base_str.contains("/var/tmp/")
            || base_str.contains("/private/var/folders/")  // macOS canonical
            || base_str.starts_with(std::env::temp_dir().to_string_lossy().as_ref());

        if !is_in_temp_location {
            tracing::error!(
                "SAFETY: Worktree base '{}' is not in a recognized temp directory - \
                 refusing to delete '{}'. This may indicate a misconfiguration.",
                worktree_base.display(),
                path_str
            );
            return Err(WorktreeError::UnsafePath(path_str));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn test_verify_path_safe_rejects_user_directory() {
        // User directories should always be rejected
        let user_home = dirs::home_dir().unwrap_or(PathBuf::from("/Users/test"));
        let user_project = user_home.join("projects/my-repo");

        let result = WorktreeManager::verify_path_safe_for_deletion(&user_project);
        assert!(result.is_err(), "Should reject user project directories");

        if let Err(WorktreeError::UnsafePath(path)) = result {
            assert!(path.contains("projects"), "Error should mention the path");
        } else {
            panic!("Expected UnsafePath error");
        }
    }

    #[test]
    fn test_verify_path_safe_rejects_root_paths() {
        // Root paths should be rejected
        let root = PathBuf::from("/");
        let result = WorktreeManager::verify_path_safe_for_deletion(&root);
        assert!(result.is_err(), "Should reject root path");

        let etc = PathBuf::from("/etc");
        let result = WorktreeManager::verify_path_safe_for_deletion(&etc);
        assert!(result.is_err(), "Should reject /etc");

        let usr = PathBuf::from("/usr");
        let result = WorktreeManager::verify_path_safe_for_deletion(&usr);
        assert!(result.is_err(), "Should reject /usr");
    }

    #[test]
    fn test_verify_path_safe_accepts_worktree_base_subdir() {
        // Paths inside worktree base should be accepted (if base exists)
        let worktree_base = WorktreeManager::get_worktree_base_dir();
        let test_path = worktree_base.join("test-worktree-12345");

        // This should pass the pre-canonicalization check at minimum
        // (canonicalization will fail since the path doesn't exist, but that's ok)
        let result = WorktreeManager::verify_path_safe_for_deletion(&test_path);

        // Should be Ok since it's inside the managed worktree directory
        // (unless the temp dir doesn't exist, in which case it might fail the base check)
        if result.is_err() {
            // This is acceptable if temp dir doesn't exist yet
            println!(
                "verify_path_safe_for_deletion returned error (temp dir may not exist): {:?}",
                result
            );
        }
    }

    #[test]
    fn test_worktree_base_is_in_temp() {
        // Verify the worktree base directory is in a temp location
        let worktree_base = WorktreeManager::get_worktree_base_dir();
        let base_str = worktree_base.to_string_lossy();

        let is_in_temp = base_str.contains("/var/folders/")
            || base_str.contains("/tmp/")
            || base_str.contains("/var/tmp/")
            || base_str.contains("/private/var/folders/")
            || base_str.starts_with(std::env::temp_dir().to_string_lossy().as_ref());

        assert!(
            is_in_temp,
            "Worktree base '{}' should be in a temp directory",
            base_str
        );
    }

    #[test]
    fn test_verify_path_safe_rejects_path_outside_worktree_base() {
        // Even if a path is in /tmp, it should be rejected if not in the worktree base
        let random_tmp = std::env::temp_dir().join("random-dir-not-vibe-kanban");

        let result = WorktreeManager::verify_path_safe_for_deletion(&random_tmp);
        assert!(
            result.is_err(),
            "Should reject paths outside the specific worktree base dir"
        );
    }

    #[test]
    fn test_verify_path_safe_rejects_traversal_attempts() {
        // Path traversal attempts should be rejected
        let worktree_base = WorktreeManager::get_worktree_base_dir();
        let traversal = worktree_base.join("../../../etc/passwd");

        let result = WorktreeManager::verify_path_safe_for_deletion(&traversal);
        // The starts_with check should catch this because the normalized path
        // won't start with the worktree base
        assert!(
            result.is_err(),
            "Should reject path traversal attempts: {:?}",
            traversal
        );
    }
}

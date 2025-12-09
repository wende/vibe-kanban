//! Service for generating commit messages using Claude Code CLI.

use std::{
    path::Path,
    process::{Command, Stdio},
};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum CommitMessageError {
    #[error("Failed to get git diff: {0}")]
    GitDiffFailed(String),
    #[error("No changes to commit")]
    NoChanges,
    #[error("Claude Code CLI failed: {0}")]
    ClaudeCodeFailed(String),
}

const COMMIT_MESSAGE_PROMPT: &str = r#"Generate a concise git commit message for the following diff.

Rules:
- First line should be a brief summary (max 72 characters)
- Use imperative mood (e.g., "Add feature" not "Added feature")
- Focus on WHAT changed and WHY, not HOW
- If the changes are significant, add a blank line followed by bullet points explaining key changes
- Do NOT include any explanation or preamble, just output the commit message directly

Diff:
"#;

/// Get the staged diff from the worktree, falling back to unstaged changes if nothing is staged.
pub fn get_diff_for_commit(worktree_path: &Path) -> Result<String, CommitMessageError> {
    // First try to get staged changes
    let staged_output = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| CommitMessageError::GitDiffFailed(e.to_string()))?;

    let staged_diff = String::from_utf8_lossy(&staged_output.stdout).to_string();

    if !staged_diff.trim().is_empty() {
        return Ok(staged_diff);
    }

    // Fall back to unstaged changes
    let unstaged_output = Command::new("git")
        .args(["diff", "HEAD"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| CommitMessageError::GitDiffFailed(e.to_string()))?;

    let unstaged_diff = String::from_utf8_lossy(&unstaged_output.stdout).to_string();

    if unstaged_diff.trim().is_empty() {
        // Try to get untracked files summary
        let status_output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| CommitMessageError::GitDiffFailed(e.to_string()))?;

        let status = String::from_utf8_lossy(&status_output.stdout).to_string();

        if status.trim().is_empty() {
            return Err(CommitMessageError::NoChanges);
        }

        // Format untracked files as a pseudo-diff
        let mut summary = String::from("New files:\n");
        for line in status.lines() {
            if line.starts_with("??") || line.starts_with("A ") {
                let path = line.get(3..).unwrap_or("").trim();
                summary.push_str(&format!("+ {}\n", path));
            }
        }
        return Ok(summary);
    }

    Ok(unstaged_diff)
}

/// Get the diff between the current branch and a target branch (for PR title generation).
/// This shows committed changes between branches, not uncommitted working directory changes.
pub fn get_diff_for_pr(
    worktree_path: &Path,
    target_branch: &str,
) -> Result<String, CommitMessageError> {
    // Use three-dot notation to get changes since the merge base
    let output = Command::new("git")
        .args(["diff", &format!("{}...HEAD", target_branch)])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| CommitMessageError::GitDiffFailed(e.to_string()))?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();

    if !diff.trim().is_empty() {
        return Ok(diff);
    }

    // Fallback: try two-dot notation for direct comparison
    let output = Command::new("git")
        .args(["diff", &format!("{}..HEAD", target_branch)])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| CommitMessageError::GitDiffFailed(e.to_string()))?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();

    if diff.trim().is_empty() {
        return Err(CommitMessageError::NoChanges);
    }

    Ok(diff)
}

/// Generate a commit message using Claude Code CLI with Haiku model.
pub async fn generate_commit_message(diff: &str) -> Result<String, CommitMessageError> {
    // Truncate diff if too long to avoid token limits
    let max_diff_length = 15000;
    let truncated_diff = if diff.len() > max_diff_length {
        format!(
            "{}\n\n... (diff truncated, {} more characters)",
            &diff[..max_diff_length],
            diff.len() - max_diff_length
        )
    } else {
        diff.to_string()
    };

    let prompt = format!("{}{}", COMMIT_MESSAGE_PROMPT, truncated_diff);

    // Use Claude Code CLI with Haiku model for fast, cheap commit message generation
    // Pass prompt as positional argument with --print flag for non-interactive mode
    let output = tokio::process::Command::new("claude")
        .args(["--print", "--model", "haiku", &prompt])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| {
            CommitMessageError::ClaudeCodeFailed(format!("Failed to run claude: {}", e))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CommitMessageError::ClaudeCodeFailed(format!(
            "Claude Code exited with error: {}",
            stderr
        )));
    }

    let mut message = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Strip wrapping backticks if the entire message is wrapped in ```
    if message.starts_with("```") && message.ends_with("```") {
        message = message
            .strip_prefix("```")
            .and_then(|s| s.strip_suffix("```"))
            .unwrap_or(&message)
            .trim()
            .to_string();
    }

    if message.is_empty() {
        return Err(CommitMessageError::ClaudeCodeFailed(
            "Empty response from Claude Code".to_string(),
        ));
    }

    Ok(message)
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_diff_truncation() {
        let long_diff = "a".repeat(20000);
        let max_len = 15000;

        if long_diff.len() > max_len {
            let truncated = format!(
                "{}\n\n... (diff truncated, {} more characters)",
                &long_diff[..max_len],
                long_diff.len() - max_len
            );
            assert!(truncated.contains("truncated"));
            assert!(truncated.contains("5000"));
        }
    }

    #[test]
    fn test_backtick_unwrapping() {
        // Simulate the unwrapping logic
        let wrapped = "```\nFix authentication bug\n\nResolve issue with token validation\n```";
        let mut message = wrapped.trim().to_string();

        if message.starts_with("```") && message.ends_with("```") {
            message = message
                .strip_prefix("```")
                .and_then(|s| s.strip_suffix("```"))
                .unwrap_or(&message)
                .trim()
                .to_string();
        }

        assert_eq!(
            message,
            "Fix authentication bug\n\nResolve issue with token validation"
        );
        assert!(!message.starts_with("```"));
        assert!(!message.ends_with("```"));
    }

    #[test]
    fn test_no_unwrapping_when_not_wrapped() {
        // Should not unwrap if backticks are part of the message content
        let not_wrapped = "Fix bug in `parse_commit` function";
        let mut message = not_wrapped.trim().to_string();

        if message.starts_with("```") && message.ends_with("```") {
            message = message
                .strip_prefix("```")
                .and_then(|s| s.strip_suffix("```"))
                .unwrap_or(&message)
                .trim()
                .to_string();
        }

        assert_eq!(message, "Fix bug in `parse_commit` function");
    }
}

//! Conversation export utilities for passing conversation history to different agents.
//!
//! This module provides functionality to export normalized conversation entries
//! to a markdown format that can be passed as context to a new agent.

use crate::logs::{
    ActionType, CommandExitStatus, NormalizedEntry, NormalizedEntryType, ToolStatus,
};

/// Maximum length of the exported conversation in characters.
/// If exceeded, older entries are truncated to fit.
const MAX_EXPORT_LENGTH: usize = 50_000;

/// Maximum length of command output to include in export.
const MAX_OUTPUT_LENGTH: usize = 500;

/// Result of exporting a conversation to markdown.
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
pub struct ExportResult {
    /// The exported markdown text.
    pub markdown: String,
    /// Number of messages included in the export.
    pub message_count: usize,
    /// Whether the export was truncated due to length.
    pub truncated: bool,
}

/// Export normalized conversation entries to a markdown format suitable for passing to another agent.
///
/// # Arguments
/// * `entries` - The normalized conversation entries to export
/// * `original_executor` - Name of the executor that generated the conversation (e.g., "CLAUDE_CODE")
///
/// # Returns
/// An `ExportResult` containing the markdown text and metadata about the export.
pub fn export_to_markdown(entries: &[NormalizedEntry], original_executor: &str) -> ExportResult {
    let mut parts: Vec<String> = Vec::new();
    let mut message_count = 0;

    // Header
    parts.push(format!(
        "## Previous Conversation (from {})\n",
        original_executor
    ));

    // Process each entry
    for entry in entries {
        if let Some(formatted) = format_entry(entry) {
            parts.push(formatted);
            message_count += 1;
        }
    }

    // Footer
    parts.push("\n---\n".to_string());
    parts.push("Continue from where the previous agent left off.".to_string());

    // Join all parts
    let mut markdown = parts.join("\n");

    // Check if truncation is needed
    let truncated = if markdown.len() > MAX_EXPORT_LENGTH {
        markdown = truncate_from_start(&markdown, MAX_EXPORT_LENGTH);
        true
    } else {
        false
    };

    ExportResult {
        markdown,
        message_count,
        truncated,
    }
}

/// Format a single entry to markdown. Returns None if the entry should be skipped.
fn format_entry(entry: &NormalizedEntry) -> Option<String> {
    match &entry.entry_type {
        NormalizedEntryType::UserMessage => Some(format!("**User:** {}\n", entry.content)),
        NormalizedEntryType::UserFeedback { denied_tool } => Some(format!(
            "**User:** [Denied tool: {}] {}\n",
            denied_tool, entry.content
        )),
        NormalizedEntryType::AssistantMessage => {
            Some(format!("**Assistant:** {}\n", entry.content))
        }
        NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            status,
        } => Some(format_tool_use(
            tool_name,
            action_type,
            status,
            &entry.content,
        )),
        NormalizedEntryType::ErrorMessage { .. } => Some(format!("**Error:** {}\n", entry.content)),
        NormalizedEntryType::SystemMessage => Some(format!("**System:** {}\n", entry.content)),
        // Skip these entry types - they don't add value for the new agent
        NormalizedEntryType::Thinking
        | NormalizedEntryType::Loading
        | NormalizedEntryType::NextAction { .. }
        | NormalizedEntryType::ContextUsage { .. } => None,
    }
}

/// Format a tool use entry to markdown.
fn format_tool_use(
    _tool_name: &str,
    action_type: &ActionType,
    status: &ToolStatus,
    content: &str,
) -> String {
    let status_marker = match status {
        ToolStatus::Success | ToolStatus::Created => "",
        ToolStatus::Failed => " [FAILED]",
        ToolStatus::Denied { reason } => match reason {
            Some(r) => {
                return format!(
                    "**Tool:** [{}] {} [DENIED: {}]\n",
                    format_action_type(action_type),
                    content,
                    r
                );
            }
            None => " [DENIED]",
        },
        ToolStatus::TimedOut => " [TIMED OUT]",
        ToolStatus::PendingApproval { .. } => " [PENDING]",
    };

    format!(
        "**Tool:** [{}]{} {}\n",
        format_action_type(action_type),
        status_marker,
        content
    )
}

/// Format an action type to a concise description.
fn format_action_type(action_type: &ActionType) -> String {
    match action_type {
        ActionType::FileRead { path } => format!("Read File: {}", path),
        ActionType::FileEdit { path, changes } => {
            format!("Edit File: {} ({} change(s))", path, changes.len())
        }
        ActionType::CommandRun { command, result } => {
            let mut desc = format!("Run Command: {}", truncate_str(command, 100));
            if let Some(res) = result {
                if let Some(status) = &res.exit_status {
                    let code = match status {
                        CommandExitStatus::ExitCode { code } => *code,
                        CommandExitStatus::Success { success } => {
                            if *success {
                                0
                            } else {
                                1
                            }
                        }
                    };
                    desc.push_str(&format!(" (exit: {})", code));
                }
                if let Some(output) = &res.output {
                    let truncated_output = truncate_str(output, MAX_OUTPUT_LENGTH);
                    if !truncated_output.is_empty() {
                        desc.push_str(&format!("\n    Output: {}", truncated_output));
                    }
                }
            }
            desc
        }
        ActionType::Search { query } => format!("Search: {}", truncate_str(query, 100)),
        ActionType::WebFetch { url } => format!("Web Fetch: {}", truncate_str(url, 100)),
        ActionType::Tool {
            tool_name,
            arguments,
            ..
        } => {
            if let Some(args) = arguments {
                format!("{}: {}", tool_name, truncate_str(&args.to_string(), 100))
            } else {
                tool_name.clone()
            }
        }
        ActionType::TaskCreate { description } => {
            format!("Create Task: {}", truncate_str(description, 100))
        }
        ActionType::PlanPresentation { .. } => "Plan".to_string(),
        ActionType::TodoManagement { operation, .. } => format!("Todo: {}", operation),
        ActionType::Other { description } => truncate_str(description, 100).to_string(),
    }
}

/// Truncate a string to max_len characters at a valid UTF-8 boundary.
fn truncate_str(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        // Find a safe UTF-8 boundary
        let mut end = max_len;
        while !s.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        &s[..end]
    }
}

/// Truncate markdown from the start to fit within max_len, preserving the header and footer.
fn truncate_from_start(markdown: &str, max_len: usize) -> String {
    if markdown.len() <= max_len {
        return markdown.to_string();
    }

    // Find where to cut - we want to keep from the end
    let cut_point = markdown.len() - max_len;

    // Find the next newline after cut_point to avoid cutting mid-line
    let start = markdown[cut_point..]
        .find('\n')
        .map(|i| cut_point + i + 1)
        .unwrap_or(cut_point);

    // Find a safe UTF-8 boundary
    let mut safe_start = start;
    while !markdown.is_char_boundary(safe_start) && safe_start < markdown.len() {
        safe_start += 1;
    }

    format!(
        "## Previous Conversation (truncated)\n\n[...earlier conversation omitted...]\n\n{}",
        &markdown[safe_start..]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_empty_entries() {
        let entries: Vec<NormalizedEntry> = vec![];
        let result = export_to_markdown(&entries, "CLAUDE_CODE");

        assert!(result.markdown.contains("Previous Conversation"));
        assert!(result.markdown.contains("CLAUDE_CODE"));
        assert_eq!(result.message_count, 0);
        assert!(!result.truncated);
    }

    #[test]
    fn test_export_user_message() {
        let entries = vec![NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::UserMessage,
            content: "Hello, please help me".to_string(),
            metadata: None,
        }];

        let result = export_to_markdown(&entries, "CLAUDE_CODE");

        assert!(result.markdown.contains("**User:** Hello, please help me"));
        assert_eq!(result.message_count, 1);
    }

    #[test]
    fn test_export_assistant_message() {
        let entries = vec![NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: "I'll help you with that".to_string(),
            metadata: None,
        }];

        let result = export_to_markdown(&entries, "GEMINI");

        assert!(
            result
                .markdown
                .contains("**Assistant:** I'll help you with that")
        );
        assert!(result.markdown.contains("GEMINI"));
    }

    #[test]
    fn test_export_skips_thinking() {
        let entries = vec![
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::Thinking,
                content: "Internal reasoning...".to_string(),
                metadata: None,
            },
            NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content: "Here's my answer".to_string(),
                metadata: None,
            },
        ];

        let result = export_to_markdown(&entries, "CLAUDE_CODE");

        assert!(!result.markdown.contains("Internal reasoning"));
        assert!(result.markdown.contains("Here's my answer"));
        assert_eq!(result.message_count, 1); // Only the assistant message
    }

    #[test]
    fn test_export_tool_use_file_edit() {
        let entries = vec![NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "Edit".to_string(),
                action_type: ActionType::FileEdit {
                    path: "src/main.rs".to_string(),
                    changes: vec![],
                },
                status: ToolStatus::Success,
            },
            content: "Editing main.rs".to_string(),
            metadata: None,
        }];

        let result = export_to_markdown(&entries, "CLAUDE_CODE");

        assert!(result.markdown.contains("Edit File: src/main.rs"));
        assert_eq!(result.message_count, 1);
    }

    #[test]
    fn test_export_failed_tool() {
        let entries = vec![NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "Bash".to_string(),
                action_type: ActionType::CommandRun {
                    command: "npm test".to_string(),
                    result: None,
                },
                status: ToolStatus::Failed,
            },
            content: "Running tests".to_string(),
            metadata: None,
        }];

        let result = export_to_markdown(&entries, "CLAUDE_CODE");

        assert!(result.markdown.contains("[FAILED]"));
        assert!(result.markdown.contains("npm test"));
    }

    #[test]
    fn test_truncate_str() {
        assert_eq!(truncate_str("hello", 10), "hello");
        assert_eq!(truncate_str("hello world", 5), "hello");
    }
}

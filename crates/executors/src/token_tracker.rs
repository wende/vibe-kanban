//! Token tracking utilities for AI agents
//!
//! This module provides context window size information and utilities
//! for calculating token usage across different AI agents.

use crate::logs::{ContextUsage, ContextWarningLevel};

/// Default context window sizes for various models
pub mod context_windows {
    /// Claude models context window sizes
    pub mod claude {
        /// Claude 3.5 Sonnet context window (200K)
        pub const CLAUDE_35_SONNET: u64 = 200_000;
        /// Claude 3.5 Haiku context window (200K)
        pub const CLAUDE_35_HAIKU: u64 = 200_000;
        /// Claude 3 Opus context window (200K)
        pub const CLAUDE_3_OPUS: u64 = 200_000;
        /// Claude 4 models context window (200K)
        pub const CLAUDE_4: u64 = 200_000;
        /// Default for unknown Claude models
        pub const DEFAULT: u64 = 200_000;
    }

    /// Gemini models context window sizes
    pub mod gemini {
        /// Gemini 1.5 Pro context window (1M)
        pub const GEMINI_15_PRO: u64 = 1_000_000;
        /// Gemini 1.5 Flash context window (1M)
        pub const GEMINI_15_FLASH: u64 = 1_000_000;
        /// Gemini 2.0 models context window (1M)
        pub const GEMINI_20: u64 = 1_000_000;
        /// Default for unknown Gemini models
        pub const DEFAULT: u64 = 1_000_000;
    }

    /// OpenAI/Codex models context window sizes
    pub mod codex {
        /// GPT-4o context window (128K)
        pub const GPT4O: u64 = 128_000;
        /// O1 models context window (128K)
        pub const O1: u64 = 128_000;
        /// O3 models context window (200K)
        pub const O3: u64 = 200_000;
        /// Default for unknown Codex models
        pub const DEFAULT: u64 = 128_000;
    }

    /// Default context window when model is unknown
    pub const FALLBACK_DEFAULT: u64 = 128_000;
}

/// Get context window size for a model
pub fn get_context_window_size(model: &str) -> u64 {
    let model_lower = model.to_lowercase();

    // Claude models
    if model_lower.contains("claude") {
        if model_lower.contains("sonnet") {
            return context_windows::claude::CLAUDE_35_SONNET;
        }
        if model_lower.contains("haiku") {
            return context_windows::claude::CLAUDE_35_HAIKU;
        }
        if model_lower.contains("opus") {
            return context_windows::claude::CLAUDE_3_OPUS;
        }
        return context_windows::claude::DEFAULT;
    }

    // Gemini models
    if model_lower.contains("gemini") {
        if model_lower.contains("1.5-pro") || model_lower.contains("1.5 pro") {
            return context_windows::gemini::GEMINI_15_PRO;
        }
        if model_lower.contains("flash") {
            return context_windows::gemini::GEMINI_15_FLASH;
        }
        if model_lower.contains("2.0") || model_lower.contains("2-") {
            return context_windows::gemini::GEMINI_20;
        }
        return context_windows::gemini::DEFAULT;
    }

    // OpenAI/Codex models
    if model_lower.contains("gpt-4o") || model_lower.contains("gpt4o") {
        return context_windows::codex::GPT4O;
    }
    if model_lower.contains("o1") {
        return context_windows::codex::O1;
    }
    if model_lower.contains("o3") {
        return context_windows::codex::O3;
    }

    context_windows::FALLBACK_DEFAULT
}

/// Calculate warning level based on context usage percentage
pub fn calculate_warning_level(percent: f64) -> ContextWarningLevel {
    if percent >= 85.0 {
        ContextWarningLevel::Critical
    } else if percent >= 70.0 {
        ContextWarningLevel::Approaching
    } else {
        ContextWarningLevel::None
    }
}

/// Build a ContextUsage struct from token counts
pub fn build_context_usage(
    input_tokens: u64,
    output_tokens: u64,
    model: &str,
    cached_input_tokens: Option<u64>,
    cache_read_tokens: Option<u64>,
    cache_write_tokens: Option<u64>,
) -> ContextUsage {
    let context_window_size = get_context_window_size(model);
    let total_tokens = input_tokens + output_tokens;
    let context_used_percent = if context_window_size > 0 {
        (total_tokens as f64 / context_window_size as f64) * 100.0
    } else {
        0.0
    };
    let context_remaining = context_window_size.saturating_sub(total_tokens);
    let warning_level = calculate_warning_level(context_used_percent);

    ContextUsage {
        input_tokens,
        output_tokens,
        total_tokens,
        context_window_size,
        context_used_percent,
        context_remaining,
        cached_input_tokens,
        cache_read_tokens,
        cache_write_tokens,
        model: model.to_string(),
        warning_level,
        is_estimated: false,
    }
}

/// Estimate tokens from text content (rough approximation: ~4 chars per token)
pub fn estimate_tokens_from_text(text: &str) -> u64 {
    (text.len() as f64 / 4.0).ceil() as u64
}

/// Build an estimated ContextUsage from text content
pub fn build_estimated_context_usage(text: &str, model: &str) -> ContextUsage {
    let estimated_tokens = estimate_tokens_from_text(text);
    let context_window_size = get_context_window_size(model);
    let context_used_percent = if context_window_size > 0 {
        (estimated_tokens as f64 / context_window_size as f64) * 100.0
    } else {
        0.0
    };
    let context_remaining = context_window_size.saturating_sub(estimated_tokens);
    let warning_level = calculate_warning_level(context_used_percent);

    ContextUsage {
        input_tokens: estimated_tokens,
        output_tokens: 0,
        total_tokens: estimated_tokens,
        context_window_size,
        context_used_percent,
        context_remaining,
        cached_input_tokens: None,
        cache_read_tokens: None,
        cache_write_tokens: None,
        model: model.to_string(),
        warning_level,
        is_estimated: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_window_sizes() {
        assert_eq!(
            get_context_window_size("claude-3-5-sonnet"),
            context_windows::claude::CLAUDE_35_SONNET
        );
        assert_eq!(
            get_context_window_size("gemini-1.5-pro"),
            context_windows::gemini::GEMINI_15_PRO
        );
        assert_eq!(
            get_context_window_size("gpt-4o"),
            context_windows::codex::GPT4O
        );
        assert_eq!(
            get_context_window_size("unknown-model"),
            context_windows::FALLBACK_DEFAULT
        );
    }

    #[test]
    fn test_warning_levels() {
        assert_eq!(calculate_warning_level(50.0), ContextWarningLevel::None);
        assert_eq!(calculate_warning_level(70.0), ContextWarningLevel::Approaching);
        assert_eq!(calculate_warning_level(85.0), ContextWarningLevel::Critical);
        assert_eq!(calculate_warning_level(95.0), ContextWarningLevel::Critical);
    }

    #[test]
    fn test_build_context_usage() {
        let usage = build_context_usage(100_000, 5_000, "claude-3-5-sonnet", None, None, None);
        assert_eq!(usage.total_tokens, 105_000);
        assert_eq!(usage.context_window_size, 200_000);
        assert!((usage.context_used_percent - 52.5).abs() < 0.01);
        assert_eq!(usage.context_remaining, 95_000);
        assert_eq!(usage.warning_level, ContextWarningLevel::None);
    }

    #[test]
    fn test_estimate_tokens() {
        // 100 characters should be ~25 tokens
        let text = "a".repeat(100);
        assert_eq!(estimate_tokens_from_text(&text), 25);
    }
}

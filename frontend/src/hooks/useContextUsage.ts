import { useMemo } from 'react';
import type { ContextUsage, NormalizedEntryType } from 'shared/types';
import { useEntries } from '@/contexts/EntriesContext';

export interface ContextUsageData {
  usage: ContextUsage | null;
  hasData: boolean;
}

/**
 * Hook to extract context usage from streaming entries
 *
 * Context usage is calculated as:
 *   context_used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 *
 * Output tokens do NOT count toward context window usage.
 */
export function useContextUsage(): ContextUsageData {
  const { entries } = useEntries();

  const usage = useMemo(() => {
    // Find the most recent context_usage entry
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'NORMALIZED_ENTRY') {
        const entryType = entry.content.entry_type as NormalizedEntryType;
        if (entryType.type === 'context_usage') {
          return entryType.usage;
        }
      }
    }
    return null;
  }, [entries]);

  return {
    usage,
    hasData: usage !== null,
  };
}

/**
 * Format token counts for display
 * @param tokens - Token count (number or bigint)
 * @returns Formatted string like "25K", "1.5M", etc.
 */
export function formatTokens(tokens: number | bigint): string {
  const num = typeof tokens === 'bigint' ? Number(tokens) : tokens;
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${Math.round(num / 1_000)}K`;
  }
  return num.toLocaleString();
}

/**
 * Format percentage for display
 * @param percent - Percentage value (0-100)
 * @returns Formatted string like "52%"
 */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

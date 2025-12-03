import { useMemo } from 'react';
import type { ContextUsage, NormalizedEntryType } from 'shared/types';
import { useEntries } from '@/contexts/EntriesContext';

export interface ContextUsageData {
  usage: ContextUsage | null;
  hasData: boolean;
}

/**
 * Hook to extract context usage from streaming entries
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

// Helper to format token counts for display
export function formatTokens(tokens: number | bigint): string {
  const num = typeof tokens === 'bigint' ? Number(tokens) : tokens;
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toLocaleString();
}

// Helper to format percentage
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

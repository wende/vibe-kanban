import { attemptsApi } from '@/lib/api';
import { usePreviousDataQuery } from '@/hooks/usePreviousDataQuery';
import { useMemo } from 'react';
import type { BranchStatus } from 'shared/types';

/**
 * Fetches branch status for multiple task attempts in a single batch request.
 * This reduces API calls from N to 1 when displaying many cards on the board.
 */
export function useBatchBranchStatus(attemptIds: string[]) {
  // Sort and dedupe to ensure stable query key
  const stableIds = useMemo(() => {
    const unique = [...new Set(attemptIds.filter(Boolean))];
    return unique.sort();
  }, [attemptIds]);

  return usePreviousDataQuery({
    queryKey: ['batchBranchStatus', stableIds],
    queryFn: () => attemptsApi.getBatchBranchStatus(stableIds),
    enabled: stableIds.length > 0,
    // Poll to reflect rebase/commit changes
    refetchInterval: 5000,
  });
}

/**
 * Context type for providing batch branch status to child components
 */
export type BranchStatusMap = Record<string, BranchStatus>;

import { attemptsApi } from '@/lib/api';
import { usePreviousDataQuery } from '@/hooks/usePreviousDataQuery';

export function useBranchStatus(attemptId?: string) {
  return usePreviousDataQuery({
    queryKey: ['branchStatus', attemptId],
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    // Poll faster to promptly reflect rebase/abort transitions
    refetchInterval: 5000,
  });
}

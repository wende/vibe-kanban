import { attemptsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export function useTaskAttempt(attemptId?: string) {
  // Don't use usePreviousDataQuery here - we need to return undefined
  // when attemptId changes to prevent showing stale attempt data
  // (e.g., showing Task A's execution processes on Task B's sidebar)
  return useQuery({
    queryKey: ['taskAttempt', attemptId],
    queryFn: () => attemptsApi.get(attemptId!),
    enabled: !!attemptId,
  });
}

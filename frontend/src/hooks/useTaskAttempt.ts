import { attemptsApi } from '@/lib/api';
import { usePreviousDataQuery } from '@/hooks/usePreviousDataQuery';

export function useTaskAttempt(attemptId?: string) {
  return usePreviousDataQuery({
    queryKey: ['taskAttempt', attemptId],
    queryFn: () => attemptsApi.get(attemptId!),
    enabled: !!attemptId,
  });
}

import { attemptsApi } from '@/lib/api';
import { usePreviousDataQuery } from '@/hooks/usePreviousDataQuery';
import type { TaskAttempt } from 'shared/types';

export const taskAttemptKeys = {
  all: ['taskAttempts'] as const,
  byTask: (taskId: string | undefined) => ['taskAttempts', taskId] as const,
};

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useTaskAttempts(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;
  const refetchInterval = opts?.refetchInterval ?? 5000;

  return usePreviousDataQuery<TaskAttempt[]>({
    queryKey: taskAttemptKeys.byTask(taskId),
    queryFn: () => attemptsApi.getAll(taskId!),
    enabled,
    refetchInterval,
  });
}

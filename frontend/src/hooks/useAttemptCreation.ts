import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { TaskAttempt, ExecutorProfileId } from 'shared/types';

type CreateAttemptArgs = {
  profile: ExecutorProfileId;
  baseBranch: string;
  customBranch?: string;
  /** Conversation history to prepend to the prompt (for continuing with different agent) */
  conversationHistory?: string | null;
  /** Use the existing branch instead of creating a new one */
  useExistingBranch?: boolean;
};

type UseAttemptCreationArgs = {
  taskId: string;
  onSuccess?: (attempt: TaskAttempt) => void;
};

export function useAttemptCreation({
  taskId,
  onSuccess,
}: UseAttemptCreationArgs) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      profile,
      baseBranch,
      customBranch,
      conversationHistory,
      useExistingBranch,
    }: CreateAttemptArgs) =>
      attemptsApi.create({
        task_id: taskId,
        executor_profile_id: profile,
        base_branch: baseBranch,
        use_existing_branch: useExistingBranch ?? false,
        custom_branch: customBranch?.trim() || null,
        conversation_history: conversationHistory ?? null,
      }),
    onSuccess: (newAttempt: TaskAttempt) => {
      queryClient.setQueryData(
        ['taskAttempts', taskId],
        (old: TaskAttempt[] = []) => [newAttempt, ...old]
      );
      onSuccess?.(newAttempt);
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestratorApi } from '@/lib/api';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';

interface OrchestratorPanelProps {
  projectId: string;
}

export function OrchestratorPanel({ projectId }: OrchestratorPanelProps) {
  const queryClient = useQueryClient();

  // Query orchestrator state
  const { data: orchestrator, error } = useQuery({
    queryKey: ['orchestrator', projectId],
    queryFn: () => orchestratorApi.get(projectId),
    enabled: !!projectId,
    refetchInterval: 3000, // Poll for updates
  });

  // Mutation to start orchestrator automatically
  const startMutation = useMutation({
    mutationFn: () => orchestratorApi.send(projectId), // No prompt - will read ORCHESTRATOR.md
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator', projectId] });
    },
  });

  // Auto-start orchestrator when panel opens with no existing session
  useEffect(() => {
    if (orchestrator?.attempt && !orchestrator?.latest_process && !startMutation.isPending) {
      startMutation.mutate();
    }
  }, [orchestrator, startMutation]);

  const isRunning = orchestrator?.latest_process?.status === 'running';

  // Cache last valid orchestrator data to prevent flicker during transitions
  const lastOrchestratorRef = useRef(orchestrator);
  if (orchestrator?.latest_process) {
    lastOrchestratorRef.current = orchestrator;
  }
  const displayOrchestrator = orchestrator?.latest_process ? orchestrator : lastOrchestratorRef.current;

  // Convert orchestrator data to the format TaskAttemptPanel expects
  const taskWithStatus: TaskWithAttemptStatus | null = displayOrchestrator
    ? {
        ...displayOrchestrator.task,
        has_in_progress_attempt: isRunning,
        has_merged_attempt: false,
        last_attempt_failed: displayOrchestrator.latest_process?.status === 'failed',
        executor: 'CLAUDE_CODE',
        latest_task_attempt_id: displayOrchestrator.attempt.id,
      }
    : null;

  // Determine if we need to show loading overlay
  const showLoading = !displayOrchestrator?.latest_process;
  const hasError = error || startMutation.isError;
  const errorMessage = error ? String(error) : startMutation.error ? String(startMutation.error) : null;

  // Always render the same structure - loading overlay + content
  // This prevents layout jumps when switching between loading and loaded states
  return (
    <div className="h-full flex flex-col relative">
      {/* Loading overlay - same style as VirtualizedList */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-200 ${
          showLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
          {hasError && errorMessage ? (
            <span className="text-destructive">{errorMessage}</span>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>Loading...</span>
            </>
          )}
        </div>
      </div>

      {/* Content - always rendered but hidden when loading */}
      <div
        className={`h-full flex flex-col transition-opacity duration-200 ${
          showLoading ? 'opacity-0 invisible' : 'opacity-100 visible'
        }`}
      >
        {displayOrchestrator?.latest_process && (
          <ClickedElementsProvider attempt={displayOrchestrator.attempt}>
            <ReviewProvider key={displayOrchestrator.attempt.id}>
              <ExecutionProcessesProvider
                key={displayOrchestrator.attempt.id}
                attemptId={displayOrchestrator.attempt.id}
              >
                <TaskAttemptPanel
                  attempt={displayOrchestrator.attempt}
                  task={taskWithStatus}
                >
                  {({ logs, followUp }) => (
                    <div className="h-full min-h-0 flex flex-col">
                      <div className="flex-1 min-h-0 flex flex-col">{logs}</div>
                      <div className="min-h-0 max-h-[50%] border-t overflow-hidden bg-background">
                        <div className="mx-auto w-full max-w-[50rem] h-full min-h-0">
                          {followUp}
                        </div>
                      </div>
                    </div>
                  )}
                </TaskAttemptPanel>
              </ExecutionProcessesProvider>
            </ReviewProvider>
          </ClickedElementsProvider>
        )}
      </div>
    </div>
  );
}

// Export the stop mutation hook for use in header actions
export function useOrchestratorStop(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => orchestratorApi.stop(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator', projectId] });
    },
  });
}

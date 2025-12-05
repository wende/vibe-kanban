import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestratorApi } from '@/lib/api';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';

// Rainbow gradient text component for VIBE
function RainbowVibe({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontWeight: 'bold',
        background:
          'linear-gradient(to right, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      VIBE
    </span>
  );
}

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

  if (error && !displayOrchestrator) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6">
        <p className="text-destructive">Failed to load orchestrator</p>
        <p className="text-sm text-muted-foreground">{String(error)}</p>
      </div>
    );
  }

  // If no orchestrator process yet and no cached data, show starting state
  if (!displayOrchestrator?.latest_process) {
    const hasError = startMutation.isError;

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-6 text-center">
            <RainbowVibe className="text-4xl" />
            <h2 className="text-xl font-semibold">
              {hasError ? 'Failed to Start' : 'Starting Orchestrator'}
            </h2>
            {hasError ? (
              <div className="space-y-4">
                <p className="text-destructive text-sm">
                  {String(startMutation.error)}
                </p>
              </div>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">
                  Initializing orchestrator...
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show the orchestrator session with logs
  return (
    <div className="h-full flex flex-col">
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

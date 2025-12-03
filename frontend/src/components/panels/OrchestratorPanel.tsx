import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestratorApi } from '@/lib/api';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
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
  const [prompt, setPrompt] = useState('');

  // Query orchestrator state
  const {
    data: orchestrator,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orchestrator', projectId],
    queryFn: () => orchestratorApi.get(projectId),
    enabled: !!projectId,
    refetchInterval: 3000, // Poll for updates
  });

  // Mutation to send message
  const sendMutation = useMutation({
    mutationFn: (message: string) => orchestratorApi.send(projectId, message),
    onSuccess: () => {
      setPrompt('');
      queryClient.invalidateQueries({ queryKey: ['orchestrator', projectId] });
    },
  });

  // Mutation to stop orchestrator
  const stopMutation = useMutation({
    mutationFn: () => orchestratorApi.stop(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator', projectId] });
    },
  });

  const handleSend = useCallback(() => {
    if (prompt.trim()) {
      sendMutation.mutate(prompt.trim());
    }
  }, [prompt, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const isRunning = orchestrator?.latest_process?.status === 'running';

  // Convert orchestrator data to the format TaskAttemptPanel expects
  const taskWithStatus: TaskWithAttemptStatus | null = orchestrator
    ? {
        ...orchestrator.task,
        has_in_progress_attempt: isRunning,
        has_merged_attempt: false,
        last_attempt_failed: orchestrator.latest_process?.status === 'failed',
        executor: 'CLAUDE_CODE',
        latest_task_attempt_id: orchestrator.attempt.id,
      }
    : null;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6">
        <p className="text-destructive">Failed to load orchestrator</p>
        <p className="text-sm text-muted-foreground">{String(error)}</p>
      </div>
    );
  }

  // If no orchestrator attempt yet, show start panel
  if (!orchestrator?.attempt || !orchestrator?.latest_process) {
    return (
      <div className="h-full flex flex-col">
        {/* Start Panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center space-y-2">
              <RainbowVibe className="text-4xl" />
              <h2 className="text-xl font-semibold">Start Orchestrator</h2>
              <p className="text-muted-foreground">
                The global orchestrator runs Claude Code directly on your main
                branch. Use it to coordinate tasks, manage your codebase, or get
                help with complex operations.
              </p>
            </div>

            <div className="space-y-4">
              <Textarea
                placeholder="What would you like Claude to help with?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
                className="resize-none"
              />
              <Button
                className="w-full"
                onClick={handleSend}
                disabled={!prompt.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Start Orchestrator
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Press ⌘+Enter to send
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show the orchestrator session with logs
  return (
    <div className="h-full flex flex-col">
      {/* Main Content - Reuse TaskAttemptPanel */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ClickedElementsProvider attempt={orchestrator.attempt}>
          <ReviewProvider key={orchestrator.attempt.id}>
            <ExecutionProcessesProvider
              key={orchestrator.attempt.id}
              attemptId={orchestrator.attempt.id}
            >
              <TaskAttemptPanel
                attempt={orchestrator.attempt}
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

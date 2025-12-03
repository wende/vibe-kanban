import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orchestratorApi } from '@/lib/api';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Wand2, Send, Loader2 } from 'lucide-react';
import { useState, useCallback, ReactNode } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';

// Shared header component to avoid duplication
function OrchestratorHeader({
  onBack,
  isRunning,
  rightContent,
}: {
  onBack: () => void;
  isRunning?: boolean;
  rightContent?: ReactNode;
}) {
  return (
    <div className="border-b bg-background p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Global Orchestrator</h1>
            {isRunning && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Running
              </span>
            )}
          </div>
        </div>
        {rightContent}
      </div>
    </div>
  );
}

export function OrchestratorPage() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
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

  const handleBack = useCallback(() => {
    navigate(`/projects/${projectId}/tasks`);
  }, [navigate, projectId]);

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
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  // If no orchestrator attempt yet, show start panel
  if (!orchestrator?.attempt || !orchestrator?.latest_process) {
    return (
      <div className="h-full flex flex-col">
        <OrchestratorHeader onBack={handleBack} />
        {/* Start Panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center space-y-2">
              <Wand2 className="h-12 w-12 mx-auto text-muted-foreground" />
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
      <OrchestratorHeader
        onBack={handleBack}
        isRunning={isRunning}
        rightContent={
          isRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              {stopMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Stop'
              )}
            </Button>
          )
        }
      />

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
                    <div className="min-h-0 max-h-[50%] border-t overflow-hidden">
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

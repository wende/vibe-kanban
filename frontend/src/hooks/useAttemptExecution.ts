import { useMemo, useCallback, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useTaskStopping } from '@/stores/useTaskDetailsUiStore';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import type { AttemptData } from '@/lib/types';
import { BaseCodingAgent, type ExecutionProcess } from 'shared/types';

// Executors that support the compact command
const COMPACT_SUPPORTED_EXECUTORS = new Set<BaseCodingAgent>([
  BaseCodingAgent.CLAUDE_CODE,
]);

// Helper to extract base executor from an execution process
function getBaseExecutor(process: ExecutionProcess): BaseCodingAgent | null {
  const actionType = process.executor_action?.typ;
  if (!actionType) return null;

  if (
    actionType.type === 'CodingAgentInitialRequest' ||
    actionType.type === 'CodingAgentFollowUpRequest'
  ) {
    return actionType.executor_profile_id?.executor ?? null;
  }
  return null;
}

// Check if a process's executor supports compaction
function supportsCompact(process: ExecutionProcess): boolean {
  const executor = getBaseExecutor(process);
  return executor !== null && COMPACT_SUPPORTED_EXECUTORS.has(executor);
}

export function useAttemptExecution(attemptId?: string, taskId?: string) {
  const { isStopping, setIsStopping } = useTaskStopping(taskId || '');
  const [isCompacting, setIsCompacting] = useState(false);
  const [isSmartCompacting, setIsSmartCompacting] = useState(false);
  const [contextUsageResetVersion, setContextUsageResetVersion] = useState(0);

  const {
    executionProcessesVisible: executionProcesses,
    isAttemptRunningVisible: isAttemptRunning,
    isLoading: streamLoading,
  } = useExecutionProcessesContext();

  // Get setup script processes that need detailed info
  const setupProcesses = useMemo(() => {
    if (!executionProcesses.length) return [] as ExecutionProcess[];
    return executionProcesses.filter((p) => p.run_reason === 'setupscript');
  }, [executionProcesses]);

  // Fetch details for setup processes
  const processDetailQueries = useQueries({
    queries: setupProcesses.map((process) => ({
      queryKey: ['processDetails', process.id],
      queryFn: () => executionProcessesApi.getDetails(process.id),
      enabled: !!process.id,
    })),
  });

  // Build attempt data combining processes and details
  const attemptData: AttemptData = useMemo(() => {
    if (!executionProcesses.length) {
      return { processes: [], runningProcessDetails: {} };
    }

    // Build runningProcessDetails from the detail queries
    const runningProcessDetails: Record<string, ExecutionProcess> = {};

    setupProcesses.forEach((process, index) => {
      const detailQuery = processDetailQueries[index];
      if (detailQuery?.data) {
        runningProcessDetails[process.id] = detailQuery.data;
      }
    });

    return {
      processes: executionProcesses,
      runningProcessDetails,
    };
  }, [executionProcesses, setupProcesses, processDetailQueries]);

  // Stop execution function
  const stopExecution = useCallback(async () => {
    if (!attemptId || !isAttemptRunning || isStopping) return;

    try {
      setIsStopping(true);
      await attemptsApi.stop(attemptId);
    } catch (error) {
      console.error('Failed to stop executions:', error);
      throw error;
    } finally {
      setIsStopping(false);
    }
  }, [attemptId, isAttemptRunning, isStopping, setIsStopping]);

  // Check if there's a running coding agent that supports compact
  const runningCompactableAgent = useMemo(() => {
    return executionProcesses.find(
      (p) =>
        p.status === 'running' &&
        p.run_reason === 'codingagent' &&
        supportsCompact(p)
    );
  }, [executionProcesses]);

  // Check if the most recent coding agent process supports compact (for when not running)
  const latestCodingAgentSupportsCompact = useMemo(() => {
    // Find the most recent coding agent process
    const codingAgentProcesses = executionProcesses.filter(
      (p) => p.run_reason === 'codingagent'
    );
    if (codingAgentProcesses.length === 0) return false;
    // Last one is the most recent (processes are typically in chronological order)
    const latest = codingAgentProcesses[codingAgentProcesses.length - 1];
    return supportsCompact(latest);
  }, [executionProcesses]);

  // Can compact if:
  // 1. There's a running coding agent that supports compact (send /compact to running process), OR
  // 2. There's an attemptId, no process is running, and the latest coding agent supports compact
  const canCompact = useMemo(() => {
    if (runningCompactableAgent) return true;
    return !!attemptId && !isAttemptRunning && latestCodingAgentSupportsCompact;
  }, [
    attemptId,
    isAttemptRunning,
    runningCompactableAgent,
    latestCodingAgentSupportsCompact,
  ]);

  // Compact execution function - sends /compact to running process or starts a new follow-up
  const compactExecution = useCallback(async () => {
    if (isCompacting || !attemptId) return;

    try {
      setIsCompacting(true);

      if (runningCompactableAgent) {
        // If there's a running process that supports compact, send /compact directly to it
        const compacted = await executionProcessesApi.compactExecutionProcess(
          runningCompactableAgent.id
        );
        if (compacted) {
          setContextUsageResetVersion((version) => version + 1);
        }
      } else {
        // If no running process, start a new follow-up with /compact as the prompt
        await attemptsApi.followUp(attemptId, {
          prompt: '/compact',
          variant: null,
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });
        setContextUsageResetVersion((version) => version + 1);
      }
    } catch (error) {
      console.error('Failed to compact execution:', error);
      throw error;
    } finally {
      setIsCompacting(false);
    }
  }, [attemptId, runningCompactableAgent, isCompacting]);

  // Smart compact execution function - exports conversation with stripped tool results
  // and starts a new follow-up with that context
  const smartCompactExecution = useCallback(async () => {
    if (isSmartCompacting || !attemptId || isAttemptRunning) return;

    try {
      setIsSmartCompacting(true);

      // Export the conversation with smart compact (strips tool results)
      const result = await attemptsApi.exportSmartCompact(attemptId);

      if (result.markdown && result.message_count > 0) {
        // Start a new follow-up with the compacted context
        await attemptsApi.followUp(attemptId, {
          prompt: result.markdown + '\n\nContinue from where you left off.',
          variant: null,
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });
        setContextUsageResetVersion((version) => version + 1);
      }
    } catch (error) {
      console.error('Failed to smart compact execution:', error);
      throw error;
    } finally {
      setIsSmartCompacting(false);
    }
  }, [attemptId, isAttemptRunning, isSmartCompacting]);

  // Can smart compact if there's an attemptId, process is not running, and there's history
  const canSmartCompact = useMemo(() => {
    return !!attemptId && !isAttemptRunning && executionProcesses.length > 0;
  }, [attemptId, isAttemptRunning, executionProcesses.length]);

  const isLoading =
    streamLoading || processDetailQueries.some((q) => q.isLoading);
  const isFetching =
    streamLoading || processDetailQueries.some((q) => q.isFetching);

  return {
    // Data
    processes: executionProcesses,
    attemptData,
    runningProcessDetails: attemptData.runningProcessDetails,

    // Status
    isAttemptRunning,
    isLoading,
    isFetching,

    // Actions
    stopExecution,
    isStopping,
    compactExecution,
    isCompacting,
    canCompact,
    smartCompactExecution,
    isSmartCompacting,
    canSmartCompact,

    // Context usage
    contextUsageResetVersion,
  };
}

import { useMemo, useCallback, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useTaskStopping } from '@/stores/useTaskDetailsUiStore';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import type { AttemptData } from '@/lib/types';
import type { ExecutionProcess } from 'shared/types';

export function useAttemptExecution(attemptId?: string, taskId?: string) {
  const { isStopping, setIsStopping } = useTaskStopping(taskId || '');
  const [isCompacting, setIsCompacting] = useState(false);

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

  // Check if there's a running coding agent that can receive /compact directly
  const hasRunningCodingAgent = useMemo(() => {
    return executionProcesses.some(
      (p) => p.status === 'running' && p.run_reason === 'codingagent'
    );
  }, [executionProcesses]);

  // Can compact if:
  // 1. There's a running coding agent (send /compact to running process), OR
  // 2. There's an attemptId and no process is running (start follow-up with /compact)
  const canCompact = useMemo(() => {
    if (hasRunningCodingAgent) return true;
    return !!attemptId && !isAttemptRunning;
  }, [attemptId, isAttemptRunning, hasRunningCodingAgent]);

  // Compact execution function - sends /compact to running process or starts a new follow-up
  const compactExecution = useCallback(async () => {
    if (isCompacting || !attemptId) return;

    // Find the running coding agent process
    const runningProcess = executionProcesses.find(
      (p) => p.status === 'running' && p.run_reason === 'codingagent'
    );

    try {
      setIsCompacting(true);

      if (runningProcess) {
        // If there's a running process, send /compact directly to it
        await executionProcessesApi.compactExecutionProcess(runningProcess.id);
      } else {
        // If no running process, start a new follow-up with /compact as the prompt
        await attemptsApi.followUp(attemptId, {
          prompt: '/compact',
          variant: null,
          image_ids: null,
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });
      }
    } catch (error) {
      console.error('Failed to compact execution:', error);
      throw error;
    } finally {
      setIsCompacting(false);
    }
  }, [attemptId, executionProcesses, isCompacting]);

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
  };
}

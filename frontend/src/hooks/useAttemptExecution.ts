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

  // Compact execution function - sends /compact to the running Claude Code process
  const compactExecution = useCallback(async () => {
    if (!isAttemptRunning || isCompacting) return;

    // Find the running coding agent process
    const runningProcess = executionProcesses.find(
      (p) => p.status === 'running' && p.run_reason === 'codingagent'
    );

    if (!runningProcess) return;

    try {
      setIsCompacting(true);
      await executionProcessesApi.compactExecutionProcess(runningProcess.id);
    } catch (error) {
      console.error('Failed to compact execution:', error);
      throw error;
    } finally {
      setIsCompacting(false);
    }
  }, [executionProcesses, isAttemptRunning, isCompacting]);

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
  };
}

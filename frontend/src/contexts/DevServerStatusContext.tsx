
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { executionProcessesApi } from '@/lib/api';
import type { ExecutionProcess } from 'shared/types';
import { ExecutionProcessStatus } from 'shared/types';

type DevServerStatus = Record<string, ExecutionProcess | undefined>;

const DevServerStatusContext = createContext<DevServerStatus>({});

export function DevServerStatusProvider({
  children,
  attemptIds,
}: PropsWithChildren<{ attemptIds: string[] }>) {
  const { data: processes } = useQuery({
    queryKey: ['executionProcesses', attemptIds],
    queryFn: () =>
      executionProcessesApi.getExecutionProcessesForAttempts(attemptIds),
    enabled: attemptIds.length > 0,
    // Refetch every 5 seconds
    refetchInterval: 5000,
  });

  const devServerStatusByAttempt = useMemo<DevServerStatus>(() => {
    const status: DevServerStatus = {};
    if (!processes) return status;

    for (const process of processes) {
      if (process.run_reason === 'devserver' && process.status === ExecutionProcessStatus.running) {
        status[process.task_attempt_id] = process;
      }
    }

    return status;
  }, [processes]);

  return (
    <DevServerStatusContext.Provider value={devServerStatusByAttempt}>
      {children}
    </DevServerStatusContext.Provider>
  );
}

export function useDevServerStatusFromContext(
  attemptId?: string | null
): ExecutionProcess | undefined {
  const context = useContext(DevServerStatusContext);
  if (!attemptId) return undefined;
  return context[attemptId];
}

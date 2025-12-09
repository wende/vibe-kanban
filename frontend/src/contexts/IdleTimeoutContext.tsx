import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useExecutorIdleTimeout } from '@/hooks/useExecutorIdleTimeout';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useEntries } from '@/contexts/EntriesContext';
import type { ExecutionProcess } from 'shared/types';
import { setIdleTimeoutState, clearIdleTimeoutState } from '@/stores/idleTimeoutStore';

interface IdleTimeoutContextType {
  timeLeft: number;
  percent: number;
  formattedTime: string;
  reset: () => void;
  isReady: boolean;
}

const IdleTimeoutContext = createContext<IdleTimeoutContextType | null>(null);

interface IdleTimeoutProviderProps {
  children: ReactNode;
  attemptId?: string;
}

/**
 * Get the most recent activity timestamp from execution processes.
 * Uses updated_at which reflects the last activity on the process.
 */
function getLastActivityFromProcesses(
  processes: ExecutionProcess[]
): string | null {
  if (processes.length === 0) return null;

  let latest: string | null = null;

  for (const process of processes) {
    // Use updated_at as it reflects the most recent activity
    const activityTime = process.updated_at;
    if (!latest || activityTime > latest) {
      latest = activityTime;
    }
  }

  return latest;
}

export function IdleTimeoutProvider({
  children,
  attemptId,
}: IdleTimeoutProviderProps) {
  // Get execution processes - these have real timestamps
  const { executionProcessesVisible: processes, isLoading } = useExecutionProcessesContext();

  // Calculate the last activity timestamp from processes
  const lastActivityAt = useMemo(
    () => getLastActivityFromProcesses(processes),
    [processes]
  );

  // Ready when processes are loaded and we have at least one
  const isReady = !isLoading && processes.length > 0;

  const { timeLeft, percent, formattedTime, reset } = useExecutorIdleTimeout({
    timeoutSeconds: 5 * 60, // 5 minutes
    lastActivityAt,
  });

  // Watch for new tool calls in entries and reset timer
  const { entries } = useEntries();
  const prevToolCountRef = useRef(0);

  useEffect(() => {
    // Count tool_use entries
    const toolCount = entries.filter((entry) => {
      if (entry.type !== 'NORMALIZED_ENTRY') return false;
      return entry.content.entry_type.type === 'tool_use';
    }).length;

    // Reset if new tool calls appeared
    if (toolCount > prevToolCountRef.current && prevToolCountRef.current > 0) {
      reset();
    }
    prevToolCountRef.current = toolCount;
  }, [entries, reset]);

  // Sync state to global store for TaskCard to access
  useEffect(() => {
    if (attemptId && isReady) {
      setIdleTimeoutState(attemptId, { timeLeft, percent });
    }
    return () => {
      if (attemptId) {
        clearIdleTimeoutState(attemptId);
      }
    };
  }, [attemptId, timeLeft, percent, isReady]);

  const value = useMemo(
    () => ({
      timeLeft,
      percent,
      formattedTime,
      reset,
      isReady,
    }),
    [timeLeft, percent, formattedTime, reset, isReady]
  );

  return (
    <IdleTimeoutContext.Provider value={value}>
      {children}
    </IdleTimeoutContext.Provider>
  );
}

export function useIdleTimeout(): IdleTimeoutContextType {
  const context = useContext(IdleTimeoutContext);
  if (!context) {
    throw new Error('useIdleTimeout must be used within an IdleTimeoutProvider');
  }
  return context;
}

export function useIdleTimeoutReset(): () => void {
  const context = useContext(IdleTimeoutContext);
  // Return a no-op if not in provider context (graceful fallback)
  return context?.reset ?? (() => {});
}

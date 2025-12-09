import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useExecutorIdleTimeout } from '@/hooks/useExecutorIdleTimeout';
import { useEntries } from '@/contexts/EntriesContext';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';

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
  enabled?: boolean;
}

/**
 * Calculate the most recent activity timestamp from execution processes.
 * Uses completed_at if available, otherwise started_at for running processes.
 */
function getLastActivityTimestamp(
  processes: { started_at: string; completed_at: string | null; updated_at: string }[]
): string | null {
  if (processes.length === 0) return null;

  let latest: string | null = null;

  for (const process of processes) {
    // Use completed_at if the process finished, otherwise use started_at or updated_at
    const activityTime = process.completed_at ?? process.updated_at ?? process.started_at;
    if (!latest || activityTime > latest) {
      latest = activityTime;
    }
  }

  return latest;
}

export function IdleTimeoutProvider({
  children,
  enabled = true,
}: IdleTimeoutProviderProps) {
  // Get processes to calculate last activity timestamp
  const { executionProcessesVisible: processes, isLoading } = useExecutionProcessesContext();

  // Calculate the last activity timestamp from processes
  const lastActivityAt = useMemo(
    () => getLastActivityTimestamp(processes),
    [processes]
  );

  // Track if we've received initial data - once we have processes, we're ready
  const hasInitialDataRef = useRef(false);
  if (processes.length > 0) {
    hasInitialDataRef.current = true;
  }

  // Only enable the timer once we have initial data loaded
  // This prevents the timer from showing 5:00 while waiting for data
  const isReady = hasInitialDataRef.current && !isLoading;

  const { timeLeft, percent, formattedTime, reset } = useExecutorIdleTimeout({
    timeoutSeconds: 5 * 60, // 5 minutes
    enabled: enabled && isReady,
    lastActivityAt,
  });

  // Auto-reset on new tool calls by watching entries
  const { entries } = useEntries();
  const prevToolCountRef = useRef(0);

  useEffect(() => {
    // Count tool_use entries
    const toolCount = entries.filter((entry) => {
      if (entry.type !== 'NORMALIZED_ENTRY') return false;
      return entry.content.entry_type.type === 'tool_use';
    }).length;

    // Reset if new tool calls appeared
    if (toolCount > prevToolCountRef.current) {
      reset();
    }
    prevToolCountRef.current = toolCount;
  }, [entries, reset]);

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

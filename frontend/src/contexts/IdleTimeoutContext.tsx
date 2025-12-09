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

interface IdleTimeoutContextType {
  timeLeft: number;
  percent: number;
  formattedTime: string;
  reset: () => void;
}

const IdleTimeoutContext = createContext<IdleTimeoutContextType | null>(null);

interface IdleTimeoutProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function IdleTimeoutProvider({
  children,
  enabled = true,
}: IdleTimeoutProviderProps) {
  const { timeLeft, percent, formattedTime, reset } = useExecutorIdleTimeout({
    timeoutSeconds: 5 * 60, // 5 minutes
    enabled,
  });

  // Auto-reset on tool calls by watching entries for new tool_use entries
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
    }),
    [timeLeft, percent, formattedTime, reset]
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

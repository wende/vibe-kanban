import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useExecutorIdleTimeout } from '@/hooks/useExecutorIdleTimeout';
import { useEntries } from '@/contexts/EntriesContext';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';

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
 * Calculate the most recent activity timestamp from entries.
 * Entries represent actual agent interactions (messages, tool calls, etc.)
 */
function getLastActivityTimestampFromEntries(
  entries: PatchTypeWithKey[]
): string | null {
  if (entries.length === 0) return null;

  let latest: string | null = null;

  for (const entry of entries) {
    // Only NORMALIZED_ENTRY has timestamps
    if (entry.type !== 'NORMALIZED_ENTRY') continue;

    const timestamp = entry.content.timestamp;
    if (timestamp && (!latest || timestamp > latest)) {
      latest = timestamp;
    }
  }

  return latest;
}

export function IdleTimeoutProvider({
  children,
  enabled = true,
}: IdleTimeoutProviderProps) {
  // Get entries - these represent actual agent interactions with real timestamps
  const { entries } = useEntries();

  // Calculate the last activity timestamp from entries
  const lastActivityAt = useMemo(
    () => getLastActivityTimestampFromEntries(entries),
    [entries]
  );

  // Track if we've received initial data - once we have entries, we're ready
  const hasInitialDataRef = useRef(false);
  if (entries.length > 0) {
    hasInitialDataRef.current = true;
  }

  // Only enable the timer once we have initial data loaded
  // This prevents the timer from showing 5:00 while waiting for data
  const isReady = hasInitialDataRef.current;

  const { timeLeft, percent, formattedTime, reset } = useExecutorIdleTimeout({
    timeoutSeconds: 5 * 60, // 5 minutes
    enabled: enabled && isReady,
    lastActivityAt,
  });

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

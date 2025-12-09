import {
  createContext,
  useContext,
  useMemo,
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
}

/**
 * Calculate the most recent user interaction timestamp from entries.
 * Only counts user_message and user_feedback (tool denials) as user interactions.
 * Tool calls from the agent are tracked separately via the reset() function.
 */
function getLastUserInteractionTimestamp(
  entries: PatchTypeWithKey[]
): string | null {
  if (entries.length === 0) return null;

  let latest: string | null = null;

  for (const entry of entries) {
    // Only NORMALIZED_ENTRY has timestamps
    if (entry.type !== 'NORMALIZED_ENTRY') continue;

    const entryType = entry.content.entry_type.type;
    // Only count user messages and user feedback (tool denials) as user interactions
    if (entryType !== 'user_message' && entryType !== 'user_feedback') continue;

    const timestamp = entry.content.timestamp;
    if (timestamp && (!latest || timestamp > latest)) {
      latest = timestamp;
    }
  }

  return latest;
}

export function IdleTimeoutProvider({
  children,
}: IdleTimeoutProviderProps) {
  // Get entries - these contain user messages and feedback with timestamps
  const { entries } = useEntries();

  // Calculate the last user interaction timestamp from entries
  const lastActivityAt = useMemo(
    () => getLastUserInteractionTimestamp(entries),
    [entries]
  );

  // Ready when we have entries loaded (agent has started)
  // If no user interaction yet, timer will show 5:00 (full time)
  const isReady = entries.length > 0;

  const { timeLeft, percent, formattedTime, reset } = useExecutorIdleTimeout({
    timeoutSeconds: 5 * 60, // 5 minutes
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

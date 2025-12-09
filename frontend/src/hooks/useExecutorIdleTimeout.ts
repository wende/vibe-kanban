import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const DEFAULT_TIMEOUT_SECONDS = 5 * 60; // 5 minutes

export interface UseExecutorIdleTimeoutOptions {
  timeoutSeconds?: number;
  enabled?: boolean;
  /** ISO timestamp of the last activity. Timer counts down from this point. */
  lastActivityAt?: string | null;
}

export interface UseExecutorIdleTimeoutResult {
  timeLeft: number;
  percent: number;
  reset: () => void;
  formattedTime: string;
}

/**
 * Calculate time left from a given activity timestamp
 */
function calculateTimeLeftFromActivity(
  lastActivityAt: string | null | undefined,
  timeoutSeconds: number
): number {
  if (!lastActivityAt) {
    return timeoutSeconds;
  }
  const activityTime = new Date(lastActivityAt).getTime();
  const elapsed = Math.floor((Date.now() - activityTime) / 1000);
  return Math.max(0, timeoutSeconds - elapsed);
}

/**
 * Hook to track idle time for an executor, counting down from a specified timeout.
 * Can be initialized from a lastActivityAt timestamp to persist across component mounts.
 *
 * @param options.timeoutSeconds - Total countdown time in seconds (default: 300 = 5 minutes)
 * @param options.enabled - Whether the countdown is active (default: true)
 * @param options.lastActivityAt - ISO timestamp of last activity to calculate timer from
 */
export function useExecutorIdleTimeout(
  options: UseExecutorIdleTimeoutOptions = {}
): UseExecutorIdleTimeoutResult {
  const {
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
    // enabled is kept in the interface for API compatibility but not used internally
    // Consumers use isReady from the context to decide when to display
    lastActivityAt,
  } = options;

  // Track manual reset time - when user triggers reset(), we use current time
  // This takes precedence over lastActivityAt until a new lastActivityAt arrives
  const [manualResetTime, setManualResetTime] = useState<number | null>(null);

  // Track the lastActivityAt value that corresponds to the current manualResetTime
  // When lastActivityAt changes, we clear manualResetTime
  const lastActivityForManualResetRef = useRef<string | null | undefined>(lastActivityAt);

  // Clear manual reset when lastActivityAt changes to a new value
  if (lastActivityAt !== lastActivityForManualResetRef.current) {
    lastActivityForManualResetRef.current = lastActivityAt;
    if (manualResetTime !== null && lastActivityAt) {
      // New activity came in, clear the manual reset so we use the new activity time
      setManualResetTime(null);
    }
  }

  // State to force re-renders every second for the countdown
  const [tick, setTick] = useState(0);

  // Use a ref to track the interval ID
  const intervalRef = useRef<number | null>(null);

  // Reset function - uses current time as new activity time
  const reset = useCallback(() => {
    setManualResetTime(Date.now());
  }, []);

  // Run the countdown interval - always ticks to force recalculation
  // The enabled flag is used by consumers to decide whether to display, not to control the interval
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Set up interval to tick every second
    intervalRef.current = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Recalculate time left on every tick
  // tick is included in deps to force recalculation every second
  const timeLeft = useMemo(() => {
    void tick; // Force dependency on tick for recalculation
    if (manualResetTime !== null) {
      const elapsed = Math.floor((Date.now() - manualResetTime) / 1000);
      return Math.max(0, timeoutSeconds - elapsed);
    }
    return calculateTimeLeftFromActivity(lastActivityAt, timeoutSeconds);
  }, [tick, manualResetTime, lastActivityAt, timeoutSeconds]);

  // Calculate percentage remaining
  const percent = useMemo(
    () => Math.max(0, Math.min(100, Math.round((timeLeft / timeoutSeconds) * 100))),
    [timeLeft, timeoutSeconds]
  );

  // Format time as MM:SS
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeLeft]);

  return { timeLeft, percent, reset, formattedTime };
}

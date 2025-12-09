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
    enabled = true,
    lastActivityAt,
  } = options;

  // Track manual reset time - when user triggers reset(), we use current time
  // This takes precedence over lastActivityAt until a new lastActivityAt arrives
  const [manualResetTime, setManualResetTime] = useState<number | null>(null);

  // Track the lastActivityAt that was used to initialize/update the timer
  // This helps detect when lastActivityAt actually changes vs just re-renders
  const lastProcessedActivityRef = useRef<string | null>(null);

  // Calculate current time left based on manual reset or lastActivityAt
  const calculateCurrentTimeLeft = useCallback(() => {
    if (manualResetTime !== null) {
      const elapsed = Math.floor((Date.now() - manualResetTime) / 1000);
      return Math.max(0, timeoutSeconds - elapsed);
    }
    return calculateTimeLeftFromActivity(lastActivityAt, timeoutSeconds);
  }, [manualResetTime, lastActivityAt, timeoutSeconds]);

  // Initialize with calculated value - this runs on every render but useState ignores it after first
  const [timeLeft, setTimeLeft] = useState<number>(() =>
    calculateTimeLeftFromActivity(lastActivityAt, timeoutSeconds)
  );

  // Use a ref to track the interval ID
  const intervalRef = useRef<number | null>(null);

  // Reset function - uses current time as new activity time
  const reset = useCallback(() => {
    setManualResetTime(Date.now());
    setTimeLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  // When lastActivityAt changes to a NEW value (not just re-render), update the timer
  useEffect(() => {
    // Skip if lastActivityAt hasn't actually changed
    if (lastActivityAt === lastProcessedActivityRef.current) {
      return;
    }

    // Update the ref to track this value
    lastProcessedActivityRef.current = lastActivityAt ?? null;

    if (lastActivityAt) {
      // Clear manual reset since we have new activity data
      setManualResetTime(null);
      // Recalculate from the new activity timestamp
      setTimeLeft(calculateTimeLeftFromActivity(lastActivityAt, timeoutSeconds));
    }
  }, [lastActivityAt, timeoutSeconds]);

  // Run the countdown interval
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Set up interval to update every second
    intervalRef.current = window.setInterval(() => {
      const remaining = calculateCurrentTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0 && intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, calculateCurrentTimeLeft]);

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

import { useState, useEffect, useCallback, useRef } from 'react';

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
    lastActivityAt,
  } = options;

  // Track manual reset time - when user triggers reset(), we use current time
  const manualResetTimeRef = useRef<number | null>(null);

  // Track the lastActivityAt value to detect changes
  const lastActivityAtRef = useRef<string | null | undefined>(lastActivityAt);

  // Clear manual reset when lastActivityAt changes to a new value
  if (lastActivityAt !== lastActivityAtRef.current) {
    lastActivityAtRef.current = lastActivityAt;
    if (lastActivityAt) {
      // New activity came in, clear the manual reset so we use the new activity time
      manualResetTimeRef.current = null;
    }
  }

  // Calculate current time left
  const calculateTimeLeft = useCallback((): number => {
    if (manualResetTimeRef.current !== null) {
      const elapsed = Math.floor((Date.now() - manualResetTimeRef.current) / 1000);
      return Math.max(0, timeoutSeconds - elapsed);
    }
    return calculateTimeLeftFromActivity(lastActivityAt, timeoutSeconds);
  }, [lastActivityAt, timeoutSeconds]);

  // State for the displayed time
  const [timeLeft, setTimeLeft] = useState<number>(() => calculateTimeLeft());

  // Reset function - uses current time as new activity time
  const reset = useCallback(() => {
    manualResetTimeRef.current = Date.now();
    setTimeLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  // Run the countdown interval
  useEffect(() => {
    // Update immediately when lastActivityAt changes
    setTimeLeft(calculateTimeLeft());

    const intervalId = window.setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [calculateTimeLeft]);

  // Calculate percentage remaining
  const percent = Math.max(0, Math.min(100, Math.round((timeLeft / timeoutSeconds) * 100)));

  // Format time as MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return { timeLeft, percent, reset, formattedTime };
}

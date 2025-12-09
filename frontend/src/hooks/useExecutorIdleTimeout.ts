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

  // Calculate initial time left based on lastActivityAt or current time
  const calculateTimeLeft = useCallback(() => {
    if (!lastActivityAt) {
      return timeoutSeconds;
    }
    const activityTime = new Date(lastActivityAt).getTime();
    const elapsed = Math.floor((Date.now() - activityTime) / 1000);
    return Math.max(0, timeoutSeconds - elapsed);
  }, [lastActivityAt, timeoutSeconds]);

  // Track manual reset - when user triggers reset(), we use current time
  const [manualResetTime, setManualResetTime] = useState<number | null>(null);

  // Calculate time left considering both lastActivityAt and manual resets
  const getEffectiveTimeLeft = useCallback(() => {
    if (manualResetTime !== null) {
      // If manually reset, calculate from that time
      const elapsed = Math.floor((Date.now() - manualResetTime) / 1000);
      return Math.max(0, timeoutSeconds - elapsed);
    }
    return calculateTimeLeft();
  }, [manualResetTime, calculateTimeLeft, timeoutSeconds]);

  const [timeLeft, setTimeLeft] = useState<number>(getEffectiveTimeLeft);

  // Use a ref to track the interval ID
  const intervalRef = useRef<number | null>(null);

  // Reset function - uses current time as new activity time
  const reset = useCallback(() => {
    setManualResetTime(Date.now());
    setTimeLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  // When lastActivityAt changes (new process activity), clear manual reset and recalculate
  useEffect(() => {
    if (lastActivityAt) {
      setManualResetTime(null);
      setTimeLeft(calculateTimeLeft());
    }
  }, [lastActivityAt, calculateTimeLeft]);

  // Run the countdown
  useEffect(() => {
    if (!enabled) {
      setTimeLeft(timeoutSeconds);
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    // Update immediately
    const updateTimeLeft = () => {
      const remaining = getEffectiveTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0 && intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    updateTimeLeft();

    // Set up interval to update every second
    intervalRef.current = window.setInterval(updateTimeLeft, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, getEffectiveTimeLeft, timeoutSeconds]);

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

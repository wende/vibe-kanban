import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const DEFAULT_TIMEOUT_SECONDS = 5 * 60; // 5 minutes

export interface UseExecutorIdleTimeoutOptions {
  timeoutSeconds?: number;
  enabled?: boolean;
}

export interface UseExecutorIdleTimeoutResult {
  timeLeft: number;
  percent: number;
  reset: () => void;
  formattedTime: string;
}

/**
 * Hook to track idle time for an executor, counting down from a specified timeout.
 * Resets when `reset()` is called (should be triggered on any interaction).
 *
 * @param options.timeoutSeconds - Total countdown time in seconds (default: 300 = 5 minutes)
 * @param options.enabled - Whether the countdown is active (default: true)
 */
export function useExecutorIdleTimeout(
  options: UseExecutorIdleTimeoutOptions = {}
): UseExecutorIdleTimeoutResult {
  const { timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, enabled = true } = options;

  // Track when the countdown started
  const [startTime, setStartTime] = useState<number>(() => Date.now());
  const [timeLeft, setTimeLeft] = useState<number>(timeoutSeconds);

  // Use a ref to track the interval ID
  const intervalRef = useRef<number | null>(null);

  // Reset function - restarts countdown from full duration
  const reset = useCallback(() => {
    setStartTime(Date.now());
    setTimeLeft(timeoutSeconds);
  }, [timeoutSeconds]);

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
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeoutSeconds - elapsed);
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
  }, [enabled, startTime, timeoutSeconds]);

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

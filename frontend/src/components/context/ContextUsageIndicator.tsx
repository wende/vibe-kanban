import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useContextUsage,
  formatTokens,
  formatPercent,
} from '@/hooks/useContextUsage';
import type { ContextUsage, ContextWarningLevel } from 'shared/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { CircularContextUsageBar } from './CircularContextUsageBar';

interface ContextUsageIndicatorProps {
  className?: string;
  compact?: boolean;
  resetVersion?: number;
  /** On mobile, show only the circular indicator without percentage text or chevron */
  mobileCompact?: boolean;
}

interface CompactOverrideState {
  version: number;
  usageSignature: string | null;
}

export function getWarningStyles(warningLevel: ContextWarningLevel): {
  barColor: string;
  textColor: string;
  bgColor: string;
} {
  switch (warningLevel) {
    case 'critical':
      return {
        barColor: 'stroke-red-500',
        textColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-950/50',
      };
    case 'approaching':
      return {
        barColor: 'stroke-yellow-500',
        textColor: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-950/50',
      };
    default:
      return {
        barColor: 'stroke-green-500',
        textColor: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
  }
}

function ContextUsageDetails({
  usage,
  isCompacted = false,
}: {
  usage: ContextUsage;
  isCompacted?: boolean;
}) {
  const styles = getWarningStyles(isCompacted ? 'none' : usage.warning_level);

  // Convert bigint to number for display
  const inputTokens = Number(usage.input_tokens);
  const contextWindowSize = Number(usage.context_window_size);
  const contextRemaining = Number(usage.context_remaining);
  const cachedInputTokens = usage.cached_input_tokens
    ? Number(usage.cached_input_tokens)
    : 0;
  const cacheReadTokens = usage.cache_read_tokens
    ? Number(usage.cache_read_tokens)
    : 0;

  // Calculate context used (input + cache_creation + cache_read)
  const contextUsed = inputTokens + cachedInputTokens + cacheReadTokens;

  return (
    <div className={cn('p-3 pr-8 rounded-md space-y-2', styles.bgColor)}>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Context Used:</span>
        <span className="font-mono">
          {formatTokens(contextUsed)} / {formatTokens(contextWindowSize)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Remaining:</span>
        <span className="font-mono">{formatTokens(contextRemaining)}</span>
      </div>

      {!isCompacted && usage.warning_level === 'critical' && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          <span>Context nearly full. Consider using /compact.</span>
        </div>
      )}

      {!isCompacted && usage.warning_level === 'approaching' && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          <span>Approaching context limit.</span>
        </div>
      )}

      {isCompacted && (
        <div className="text-xs text-muted-foreground italic">
          Awaiting updated context usage after /compact.
        </div>
      )}
    </div>
  );
}

function getUsageSignature(usage: ContextUsage | null): string | null {
  if (!usage) {
    return null;
  }

  const cached =
    usage.cached_input_tokens !== undefined &&
    usage.cached_input_tokens !== null
      ? usage.cached_input_tokens.toString()
      : 'null';
  const cacheRead =
    usage.cache_read_tokens !== undefined && usage.cache_read_tokens !== null
      ? usage.cache_read_tokens.toString()
      : 'null';

  return [
    usage.input_tokens.toString(),
    usage.output_tokens.toString(),
    usage.total_tokens.toString(),
    usage.context_window_size.toString(),
    usage.context_used_percent.toFixed(4),
    usage.context_remaining.toString(),
    cached,
    cacheRead,
    usage.is_estimated ? 'estimated' : 'exact',
  ].join('|');
}

export function ContextUsageIndicator({
  className,
  compact = true,
  resetVersion,
  mobileCompact = false,
}: ContextUsageIndicatorProps) {
  const { usage, hasData } = useContextUsage();
  const [expanded, setExpanded] = useState(false);
  const [compactOverride, setCompactOverride] =
    useState<CompactOverrideState | null>(null);

  const usageSignature = useMemo(() => getUsageSignature(usage), [usage]);

  useEffect(() => {
    if (resetVersion === undefined) {
      return;
    }

    if (resetVersion === 0) {
      if (compactOverride !== null) {
        setCompactOverride(null);
      }
      return;
    }

    if (!compactOverride || resetVersion > compactOverride.version) {
      setCompactOverride({
        version: resetVersion,
        usageSignature,
      });
    }
  }, [resetVersion, usageSignature, compactOverride]);

  useEffect(() => {
    if (!compactOverride) return;
    if (!usageSignature) return;

    if (usageSignature !== compactOverride.usageSignature) {
      setCompactOverride(null);
    }
  }, [compactOverride, usageSignature]);

  if (!hasData || !usage) {
    return null;
  }

  const isCompacted = compactOverride !== null;
  const styles = getWarningStyles(isCompacted ? 'none' : usage.warning_level);

  // Calculate context used for tooltip
  const inputTokens = Number(usage.input_tokens);
  const cachedInputTokens = usage.cached_input_tokens
    ? Number(usage.cached_input_tokens)
    : 0;
  const cacheReadTokens = usage.cache_read_tokens
    ? Number(usage.cache_read_tokens)
    : 0;
  const contextUsed = inputTokens + cachedInputTokens + cacheReadTokens;
  const contextWindowSize = Number(usage.context_window_size);
  const displayPercent = isCompacted ? 0 : usage.context_used_percent;
  const displayWarningLevel: ContextWarningLevel = isCompacted
    ? 'none'
    : usage.warning_level;
  const percentLabel = isCompacted
    ? '?%'
    : formatPercent(usage.context_used_percent);

  if (compact && !expanded) {
    // Mobile compact: just show the circle, no text or chevron
    if (mobileCompact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center p-1 rounded-md',
                  styles.textColor,
                  className
                )}
              >
                <CircularContextUsageBar
                  percent={displayPercent}
                  warningLevel={displayWarningLevel}
                  radius={8}
                  strokeWidth={2}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {isCompacted ? (
                <>
                  <p>Context reset after /compact.</p>
                  <p className="text-muted-foreground">
                    Waiting for updated usage metrics.
                  </p>
                </>
              ) : (
                <p>
                  Context: {formatTokens(contextUsed)} /{' '}
                  {formatTokens(contextWindowSize)} tokens
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setExpanded(true)}
              className={cn(
                'flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors',
                'hover:bg-accent',
                styles.textColor,
                className
              )}
            >
              <div className="flex items-center gap-1.5">
                <CircularContextUsageBar
                  percent={displayPercent}
                  warningLevel={displayWarningLevel}
                  radius={8}
                  strokeWidth={2}
                />
                <span className="font-mono">{percentLabel}</span>
              </div>
              <ChevronDown className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {isCompacted ? (
              <>
                <p>Context reset after /compact.</p>
                <p className="text-muted-foreground">
                  Waiting for updated usage metrics.
                </p>
              </>
            ) : (
              <>
                <p>
                  Context: {formatTokens(contextUsed)} /{' '}
                  {formatTokens(contextWindowSize)} tokens
                </p>
                <p className="text-muted-foreground">Click to expand</p>
              </>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setExpanded(false)}
        className="absolute top-2 right-2 p-1 rounded hover:bg-accent"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <ContextUsageDetails usage={usage} isCompacted={isCompacted} />
    </div>
  );
}

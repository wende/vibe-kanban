import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Activity } from 'lucide-react';
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

interface ContextUsageIndicatorProps {
  className?: string;
  compact?: boolean;
}

function getWarningStyles(warningLevel: ContextWarningLevel): {
  barColor: string;
  textColor: string;
  bgColor: string;
} {
  switch (warningLevel) {
    case 'critical':
      return {
        barColor: 'bg-red-500',
        textColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-950/50',
      };
    case 'approaching':
      return {
        barColor: 'bg-yellow-500',
        textColor: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-950/50',
      };
    default:
      return {
        barColor: 'bg-green-500',
        textColor: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
  }
}

function ContextUsageBar({
  percent,
  warningLevel,
}: {
  percent: number;
  warningLevel: ContextWarningLevel;
}) {
  const styles = getWarningStyles(warningLevel);
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div
        className={cn(
          'h-full transition-all duration-300',
          styles.barColor,
          warningLevel === 'approaching' && 'animate-pulse'
        )}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  );
}

function ContextUsageDetails({ usage }: { usage: ContextUsage }) {
  const styles = getWarningStyles(usage.warning_level);

  // Convert bigint to number for display
  const inputTokens = Number(usage.input_tokens);
  const outputTokens = Number(usage.output_tokens);
  const contextWindowSize = Number(usage.context_window_size);
  const contextRemaining = Number(usage.context_remaining);
  const cachedInputTokens = usage.cached_input_tokens
    ? Number(usage.cached_input_tokens)
    : null;
  const cacheReadTokens = usage.cache_read_tokens
    ? Number(usage.cache_read_tokens)
    : null;

  // Calculate context used (input + cache_creation + cache_read)
  const contextUsed =
    inputTokens + (cachedInputTokens ?? 0) + (cacheReadTokens ?? 0);

  return (
    <div className={cn('p-3 rounded-md space-y-3', styles.bgColor)}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">Context Usage</span>
        <span className="text-xs text-muted-foreground">{usage.model}</span>
      </div>

      <ContextUsageBar
        percent={usage.context_used_percent}
        warningLevel={usage.warning_level}
      />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Input:</span>
          <span className="ml-2 font-mono">{formatTokens(inputTokens)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Output:</span>
          <span className="ml-2 font-mono">{formatTokens(outputTokens)}</span>
        </div>
        {cachedInputTokens !== null && (
          <div>
            <span className="text-muted-foreground">Cached:</span>
            <span className="ml-2 font-mono">
              {formatTokens(cachedInputTokens)}
            </span>
          </div>
        )}
        {cacheReadTokens !== null && (
          <div>
            <span className="text-muted-foreground">Cache Read:</span>
            <span className="ml-2 font-mono">
              {formatTokens(cacheReadTokens)}
            </span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Context Used:</span>
          <span className="font-mono">
            {formatTokens(contextUsed)} / {formatTokens(contextWindowSize)}
          </span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-muted-foreground">Remaining:</span>
          <span className="font-mono">{formatTokens(contextRemaining)}</span>
        </div>
      </div>

      {usage.warning_level === 'critical' && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          <span>Context nearly full. Consider using /compact.</span>
        </div>
      )}

      {usage.warning_level === 'approaching' && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          <span>Approaching context limit.</span>
        </div>
      )}

      {usage.is_estimated && (
        <div className="text-xs text-muted-foreground italic">
          * Estimated from text length
        </div>
      )}
    </div>
  );
}

export function ContextUsageIndicator({
  className,
  compact = true,
}: ContextUsageIndicatorProps) {
  const { usage, hasData } = useContextUsage();
  const [expanded, setExpanded] = useState(false);

  if (!hasData || !usage) {
    return null;
  }

  const styles = getWarningStyles(usage.warning_level);

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

  if (compact && !expanded) {
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
              <Activity className="h-3 w-3" />
              <div className="flex items-center gap-1.5">
                <div className="w-16">
                  <ContextUsageBar
                    percent={usage.context_used_percent}
                    warningLevel={usage.warning_level}
                  />
                </div>
                <span className="font-mono">
                  {formatPercent(usage.context_used_percent)}
                </span>
              </div>
              <ChevronDown className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>
              Context: {formatTokens(contextUsed)} /{' '}
              {formatTokens(contextWindowSize)} tokens
            </p>
            <p className="text-muted-foreground">Click to expand</p>
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
      <ContextUsageDetails usage={usage} />
    </div>
  );
}

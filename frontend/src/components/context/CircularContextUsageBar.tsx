import { cn } from '@/lib/utils';
import { getWarningStyles } from './ContextUsageIndicator';
import type { ContextWarningLevel } from 'shared/types';

interface CircularContextUsageBarProps {
  percent: number;
  warningLevel: ContextWarningLevel;
  radius?: number;
  strokeWidth?: number;
}

export function CircularContextUsageBar({
  percent,
  warningLevel,
  radius = 10,
  strokeWidth = 2,
}: CircularContextUsageBarProps) {
  const styles = getWarningStyles(warningLevel);
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (clampedPercent / 100) * circumference;

  return (
    <svg
      width={radius * 2}
      height={radius * 2}
      viewBox={`0 0 ${radius * 2} ${radius * 2}`}
      className="-rotate-90"
    >
      <circle
        cx={radius}
        cy={radius}
        r={radius - strokeWidth / 2}
        fill="none"
        strokeWidth={strokeWidth}
        className="text-secondary"
      />
      <circle
        cx={radius}
        cy={radius}
        r={radius - strokeWidth / 2}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className={cn(
          'transition-all duration-300',
          styles.barColor,
          warningLevel === 'approaching' && 'animate-pulse'
        )}
        strokeLinecap="round"
      />
    </svg>
  );
}

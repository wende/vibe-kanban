import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { IdleTimeoutProvider } from '@/contexts/IdleTimeoutContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { useTaskReadStatus } from '@/contexts/TaskReadStatusContext';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface TaskAttemptPanelProps {
  attempt: TaskAttempt | undefined;
  task: TaskWithAttemptStatus | null;
  attemptId?: string;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
  disableLoadingOverlay?: boolean; // Pass through to VirtualizedList
  showTopLevelLoading?: boolean; // Show loading overlay at TaskAttemptPanel level
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-3 rounded bg-muted-foreground/20 animate-pulse',
        className
      )}
    />
  );
}

function LogsSkeleton() {
  return (
    <div className="h-full w-full animate-pulse">
      <div className="space-y-4 p-4">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="space-y-2">
            <SkeletonLine className="w-1/5 h-2" />
            <SkeletonLine className="w-3/5" />
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpSkeleton() {
  return (
    <div className="h-full w-full animate-pulse">
      <div className="space-y-3 p-4">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-4/5" />
      </div>
    </div>
  );
}

const TaskAttemptPanel = ({
  attempt,
  task,
  attemptId,
  children,
  disableLoadingOverlay = false,
  showTopLevelLoading = false,
}: TaskAttemptPanelProps) => {
  const { markAsRead } = useTaskReadStatus();
  // Keep track of the last valid attempt to prevent flickering during transitions
  const lastAttemptRef = useRef<TaskAttempt | undefined>(attempt);
  const lastTaskRef = useRef<TaskWithAttemptStatus | null>(task);

  // Update refs when we have valid data
  if (attempt) {
    lastAttemptRef.current = attempt;
  }
  if (task) {
    lastTaskRef.current = task;
  }

  // Use the last valid data for rendering to prevent skeleton flash
  const displayAttempt = attempt ?? lastAttemptRef.current;
  const displayTask = task ?? lastTaskRef.current;

  // Mark task as read when viewing the panel, and whenever it gets updated
  useEffect(() => {
    if (task?.id) {
      markAsRead(task.id);
    }
  }, [task?.id, task?.updated_at, markAsRead]);

  const hasContent = !!(displayTask && displayAttempt);
  // Show loading only when we truly have no content to display
  const showLoading = showTopLevelLoading && !hasContent;

  const logsContent =
    displayTask && displayAttempt ? (
      <VirtualizedList
        attempt={displayAttempt}
        task={displayTask}
        disableLoadingOverlay={disableLoadingOverlay || showTopLevelLoading}
      />
    ) : (
      <LogsSkeleton />
    );
  const followUpContent =
    displayTask && displayAttempt ? (
      <TaskFollowUpSection
        task={displayTask}
        selectedAttemptId={displayAttempt.id}
      />
    ) : (
      <FollowUpSkeleton />
    );
  const providerResetKey = attempt?.id ?? attemptId ?? 'pending-attempt';

  const content = (
    <EntriesProvider resetKey={providerResetKey}>
      <IdleTimeoutProvider key={providerResetKey} attemptId={attempt?.id}>
        <RetryUiProvider attemptId={attempt?.id}>
          {children({
            logs: logsContent,
            followUp: followUpContent,
          })}
        </RetryUiProvider>
      </IdleTimeoutProvider>
    </EntriesProvider>
  );

  if (!showTopLevelLoading) {
    return content;
  }

  // Wrap with loading overlay when showTopLevelLoading is enabled
  return (
    <div className="h-full flex flex-col relative">
      {/* Loading overlay - only shown when we have no cached content */}
      <div
        className={cn(
          'absolute inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-150',
          showLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>Loading...</span>
        </div>
      </div>
      {/* Content - always visible, ref-based caching prevents flash */}
      <div className="flex-1 min-h-0 flex flex-col">{content}</div>
    </div>
  );
};

export default TaskAttemptPanel;

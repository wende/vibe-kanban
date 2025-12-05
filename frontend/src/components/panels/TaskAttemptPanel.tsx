import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { useTaskReadStatus } from '@/contexts/TaskReadStatusContext';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// Wrapper that fades in content after mount
function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to ensure content is rendered before fading in
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        'transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
}

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

  // Top-level loading state (similar to OrchestratorPanel)
  const [readyToShow, setReadyToShow] = useState(false);
  const hasContent = !!(displayTask && displayAttempt);

  useEffect(() => {
    if (!showTopLevelLoading) return; // Only manage loading if enabled

    if (!hasContent) {
      setReadyToShow(false);
      return;
    }

    // Wait for VirtualizedList child to fully load and render
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) {
              setReadyToShow(true);
            }
          }, 250);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [hasContent, showTopLevelLoading]);

  const showLoading = showTopLevelLoading && (!hasContent || !readyToShow);

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
      <FadeIn className="h-full">
        <TaskFollowUpSection task={displayTask} selectedAttemptId={displayAttempt.id} />
      </FadeIn>
    ) : (
      <FollowUpSkeleton />
    );
  const providerResetKey = attempt?.id ?? attemptId ?? 'pending-attempt';

  const content = (
    <EntriesProvider resetKey={providerResetKey}>
      <RetryUiProvider attemptId={attempt?.id}>
        {children({
          logs: logsContent,
          followUp: followUpContent,
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );

  if (!showTopLevelLoading) {
    return content;
  }

  // Wrap with loading overlay when showTopLevelLoading is enabled
  return (
    <div className="h-full flex flex-col relative">
      {/* Loading overlay */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-200 ${
          showLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>Loading...</span>
        </div>
      </div>
      {/* Content */}
      <div
        className={`flex-1 min-h-0 flex flex-col transition-opacity duration-200 ${
          readyToShow ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        {content}
      </div>
    </div>
  );
};

export default TaskAttemptPanel;

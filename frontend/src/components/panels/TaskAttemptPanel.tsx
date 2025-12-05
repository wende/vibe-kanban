import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import VirtualizedList from '@/components/logs/VirtualizedList';
import { TaskFollowUpSection } from '@/components/tasks/TaskFollowUpSection';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { useTaskReadStatus } from '@/contexts/TaskReadStatusContext';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TaskAttemptPanelProps {
  attempt: TaskAttempt | undefined;
  task: TaskWithAttemptStatus | null;
  children: (sections: { logs: ReactNode; followUp: ReactNode }) => ReactNode;
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
  children,
}: TaskAttemptPanelProps) => {
  const { markAsRead } = useTaskReadStatus();

  // Mark task as read when opening the panel
  useEffect(() => {
    if (task?.id) {
      markAsRead(task.id);
    }
  }, [task?.id, markAsRead]);

  if (!task || !attempt) {
    return children({
      logs: <LogsSkeleton />,
      followUp: <FollowUpSkeleton />,
    });
  }

  return (
    <EntriesProvider key={attempt.id}>
      <RetryUiProvider attemptId={attempt.id}>
        {children({
          logs: (
            <VirtualizedList key={attempt.id} attempt={attempt} task={task} />
          ),
          followUp: (
            <TaskFollowUpSection task={task} selectedAttemptId={attempt.id} />
          ),
        })}
      </RetryUiProvider>
    </EntriesProvider>
  );
};

export default TaskAttemptPanel;

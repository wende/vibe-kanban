import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
  disableLoadingOverlay?: boolean;
}

interface MessageListContext {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
}

const VirtualizedList = ({
  attempt,
  task,
  disableLoadingOverlay = false,
}: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const { setEntries, reset } = useEntries();
  const prevAttemptIdRef = useRef<string | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isInitialLoadRef = useRef(true);

  // Track attempt changes
  useEffect(() => {
    const prevAttemptId = prevAttemptIdRef.current;
    prevAttemptIdRef.current = attempt.id;

    if (prevAttemptId !== null && prevAttemptId !== attempt.id) {
      setLoading(true);
      reset();
      isInitialLoadRef.current = true;
    } else if (prevAttemptId === null) {
      setLoading(true);
      reset();
    }
  }, [attempt.id, reset]);

  const hasData = entries.length > 0;
  const isReady = !loading && hasData;

  // Scroll to bottom helper
  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: 'LAST',
          align: 'end',
          behavior,
        });
      });
    },
    []
  );

  const onEntriesUpdated = useCallback(
    (
      newEntries: PatchTypeWithKey[],
      addType: AddEntryType,
      newLoading: boolean
    ) => {
      const wasInitialLoad = isInitialLoadRef.current;

      setEntriesState(newEntries);
      setEntries(newEntries);

      if (loading && !newLoading) {
        setLoading(false);
        isInitialLoadRef.current = false;
        // Initial load: jump to bottom instantly
        scrollToBottom('auto');
      } else if (addType === 'new_process' && !wasInitialLoad) {
        // A new execution process started - always scroll to bottom to show the new output
        // This handles follow-ups and agent changes regardless of current scroll position
        scrollToBottom('smooth');
        // Reset atBottom state since we're forcing scroll to bottom
        setAtBottom(true);
      } else if (addType === 'running' && atBottom && !wasInitialLoad) {
        // Ongoing streaming content while at bottom: smooth scroll to follow
        scrollToBottom('smooth');
      }
    },
    [loading, atBottom, setEntries, scrollToBottom]
  );

  useConversationHistory({ attempt, onEntriesUpdated });

  const context = useMemo<MessageListContext>(
    () => ({ attempt, task }),
    [attempt, task]
  );

  return (
    <ApprovalFormProvider>
      <div className="h-full flex flex-col relative">
        {/* Loading overlay */}
        {!disableLoadingOverlay && (
          <div
            className={`absolute inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-150 ${
              isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px]">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>Loading...</span>
            </div>
          </div>
        )}

        {/* Virtuoso list */}
        <div className="h-full">
          <Virtuoso
            ref={virtuosoRef}
            className="h-full"
            data={entries}
            atBottomStateChange={setAtBottom}
            atBottomThreshold={50}
            increaseViewportBy={{ top: 150, bottom: 300 }}
            computeItemKey={(_, item) => `l-${item.patchKey}`}
            components={{
              Header: () => <div className="h-2" />,
              Footer: () => <div className="h-2" />,
            }}
            itemContent={(_, data) => {
              if (data.type === 'STDOUT') {
                return <p>{data.content}</p>;
              }
              if (data.type === 'STDERR') {
                return <p>{data.content}</p>;
              }
              if (data.type === 'NORMALIZED_ENTRY' && context.attempt) {
                return (
                  <DisplayConversationEntry
                    expansionKey={data.patchKey}
                    entry={data.content}
                    executionProcessId={data.executionProcessId}
                    taskAttempt={context.attempt}
                    task={context.task}
                  />
                );
              }
              return null;
            }}
          />
        </div>
      </div>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;

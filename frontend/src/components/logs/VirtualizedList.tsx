import {
  DataWithScrollModifier,
  ScrollModifier,
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
  VirtuosoMessageListMethods,
  VirtuosoMessageListProps,
} from '@virtuoso.dev/message-list';
import { useEffect, useMemo, useRef, useState } from 'react';

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
}

interface MessageListContext {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
}

const INITIAL_TOP_ITEM = { index: 'LAST' as const, align: 'end' as const };

const InitialDataScrollModifier: ScrollModifier = {
  type: 'item-location',
  location: INITIAL_TOP_ITEM,
  purgeItemSizes: true,
};

const AutoScrollToBottom: ScrollModifier = {
  type: 'auto-scroll-to-bottom',
  autoScroll: 'smooth',
};

const ItemContent: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['ItemContent'] = ({ data, context }) => {
  const attempt = context?.attempt;
  const task = context?.task;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        task={task}
      />
    );
  }

  return null;
};

const computeItemKey: VirtuosoMessageListProps<
  PatchTypeWithKey,
  MessageListContext
>['computeItemKey'] = ({ data }) => `l-${data.patchKey}`;

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [channelData, setChannelData] = useState<
    DataWithScrollModifier<PatchTypeWithKey>
  >({ data: [], scrollModifier: InitialDataScrollModifier });
  const [loading, setLoading] = useState(true);
  // Track if we're ready to show content (data loaded + paint delay passed)
  const [readyToShow, setReadyToShow] = useState(false);
  const { setEntries, reset } = useEntries();
  const prevAttemptIdRef = useRef<string | null>(null);

  // Track attempt changes - don't clear data until new data arrives to prevent flicker
  useEffect(() => {
    const prevAttemptId = prevAttemptIdRef.current;
    prevAttemptIdRef.current = attempt.id;

    // Only act if this is an actual attempt change (not initial mount)
    if (prevAttemptId !== null && prevAttemptId !== attempt.id) {
      // Just set loading to show indicator - DON'T clear channelData
      // The old content stays visible until onEntriesUpdated brings new data
      setLoading(true);
      setReadyToShow(false);
      // Reset entries context for the new attempt
      reset();
    } else if (prevAttemptId === null) {
      // Initial mount - set loading
      setLoading(true);
      setReadyToShow(false);
      reset();
    }
  }, [attempt.id, reset]);

  // Show content only after loading is done AND we have data
  // Use double RAF + small delay to ensure Virtuoso has fully painted
  useEffect(() => {
    if (loading || channelData.data.length === 0) {
      setReadyToShow(false);
      return;
    }

    // Data is loaded - wait for two animation frames + small delay
    // to ensure Virtuoso has fully rendered and painted its items
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          // Additional small delay for Virtuoso to finish layout
          setTimeout(() => {
            if (!cancelled) {
              setReadyToShow(true);
            }
          }, 100);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [loading, channelData.data.length]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    let scrollModifier: ScrollModifier = InitialDataScrollModifier;

    if (addType === 'running' && !loading) {
      scrollModifier = AutoScrollToBottom;
    }

    setChannelData({ data: newEntries, scrollModifier });
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListRef = useRef<VirtuosoMessageListMethods | null>(null);
  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  return (
    <ApprovalFormProvider>
      <div className="relative h-full min-h-0">
        {!readyToShow && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading history...</span>
            </div>
          </div>
        )}
        <div className={readyToShow ? 'visible' : 'invisible'}>
          <VirtuosoMessageListLicense
            licenseKey={import.meta.env.VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY}
          >
            <VirtuosoMessageList<PatchTypeWithKey, MessageListContext>
              ref={messageListRef}
              className="h-full"
              data={channelData}
              initialLocation={INITIAL_TOP_ITEM}
              context={messageListContext}
              computeItemKey={computeItemKey}
              ItemContent={ItemContent}
              Header={() => <div className="h-2"></div>}
              Footer={() => <div className="h-2"></div>}
            />
          </VirtuosoMessageListLicense>
        </div>
      </div>
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;

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
  disableLoadingOverlay?: boolean; // Disable internal loading overlay when parent already has one
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

const VirtualizedList = ({ attempt, task, disableLoadingOverlay = false }: VirtualizedListProps) => {
  const [channelData, setChannelData] = useState<
    DataWithScrollModifier<PatchTypeWithKey>
  >({ data: [], scrollModifier: InitialDataScrollModifier });
  const [loading, setLoading] = useState(true);
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
      // Reset entries context for the new attempt
      reset();
    } else if (prevAttemptId === null) {
      // Initial mount - set loading
      setLoading(true);
      reset();
    }
  }, [attempt.id, reset]);

  // Content is ready when we have data and loading is complete
  const hasData = (channelData.data?.length ?? 0) > 0;
  const isReady = !loading && hasData;

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
      <div className="h-full flex flex-col relative">
        {/* Loading overlay - only show if not disabled by parent */}
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
        {/* Content - always rendered, virtuoso handles visibility efficiently */}
        <div className="h-full">
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
              increaseViewportBy={{ top: 300, bottom: 300 }}
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

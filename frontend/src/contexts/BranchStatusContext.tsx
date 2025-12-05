import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { BranchStatus } from 'shared/types';
import { useBatchBranchStatus } from '@/hooks';

type BranchStatusContextValue = Record<string, BranchStatus>;

const BranchStatusContext = createContext<BranchStatusContextValue>({});

interface BranchStatusProviderProps {
  attemptIds: string[];
  children: ReactNode;
}

/**
 * Provides batch-fetched branch status to child components.
 * This replaces N individual useBranchStatus calls with a single batch request.
 */
export function BranchStatusProvider({
  attemptIds,
  children,
}: BranchStatusProviderProps) {
  const { data: statusMap } = useBatchBranchStatus(attemptIds);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => statusMap ?? {}, [statusMap]);

  return (
    <BranchStatusContext.Provider value={value}>
      {children}
    </BranchStatusContext.Provider>
  );
}

/**
 * Hook to access branch status from the batch context.
 * Returns the status for the given attemptId, or undefined if not available.
 */
export function useBranchStatusFromContext(
  attemptId?: string | null
): BranchStatus | undefined {
  const statusMap = useContext(BranchStatusContext);
  return attemptId ? statusMap[attemptId] : undefined;
}

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import type { PatchTypeWithKey } from '@/hooks/useConversationHistory';

interface EntriesContextType {
  entries: PatchTypeWithKey[];
  setEntries: (entries: PatchTypeWithKey[]) => void;
  reset: () => void;
}

const EntriesContext = createContext<EntriesContextType | null>(null);

interface EntriesProviderProps {
  children: ReactNode;
  resetKey?: string | number | null;
}

export const EntriesProvider = ({
  children,
  resetKey,
}: EntriesProviderProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  // Track resetKey changes to know when to accept new entries vs keep old
  const currentResetKeyRef = useRef(resetKey);

  // Don't clear entries immediately on resetKey change - this causes flicker
  // Instead, let setEntries replace them when new data arrives
  // Just track that the key changed so reset() knows to clear
  if (currentResetKeyRef.current !== resetKey) {
    currentResetKeyRef.current = resetKey;
  }

  const setEntries = useCallback((newEntries: PatchTypeWithKey[]) => {
    setEntriesState(newEntries);
  }, []);

  const reset = useCallback(() => {
    setEntriesState([]);
  }, []);

  const value = useMemo(
    () => ({
      entries,
      setEntries,
      reset,
    }),
    [entries, setEntries, reset]
  );

  return (
    <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>
  );
};

export const useEntries = (): EntriesContextType => {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return context;
};

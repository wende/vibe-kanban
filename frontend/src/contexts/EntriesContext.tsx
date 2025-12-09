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
  // Track resetKey changes to clear entries and prevent cross-attempt content leakage
  const currentResetKeyRef = useRef(resetKey);

  // Clear entries immediately when resetKey changes to prevent stale content
  // from one attempt appearing when viewing another attempt
  if (currentResetKeyRef.current !== resetKey) {
    currentResetKeyRef.current = resetKey;
    // Note: This is intentionally a side effect during render to ensure
    // entries are cleared synchronously with the key change
    if (entries.length > 0) {
      setEntriesState([]);
    }
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

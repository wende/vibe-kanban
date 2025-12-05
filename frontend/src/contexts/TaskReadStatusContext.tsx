import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'task-last-viewed';

type LastViewedStore = Record<string, string>; // taskId -> ISO timestamp

function getStore(): LastViewedStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setStore(store: LastViewedStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage not available
  }
}

interface TaskReadStatusContextValue {
  markAsRead: (taskId: string) => void;
  hasUnread: (taskId: string, updatedAt: string | Date) => boolean;
}

const TaskReadStatusContext = createContext<TaskReadStatusContextValue | null>(
  null
);

export function TaskReadStatusProvider({ children }: { children: ReactNode }) {
  const [lastViewed, setLastViewed] = useState<LastViewedStore>(getStore);

  // Sync state with localStorage on mount and across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setLastViewed(getStore());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const markAsRead = useCallback((taskId: string) => {
    const newStore = {
      ...getStore(),
      [taskId]: new Date().toISOString(),
    };
    setStore(newStore);
    setLastViewed(newStore);
  }, []);

  const hasUnread = useCallback(
    (taskId: string, updatedAt: string | Date): boolean => {
      const lastViewedTime = lastViewed[taskId];
      if (!lastViewedTime) {
        // Never viewed - show as unread
        return true;
      }

      const lastViewedDate = new Date(lastViewedTime);
      const updatedDate = new Date(updatedAt);

      return updatedDate > lastViewedDate;
    },
    [lastViewed]
  );

  return (
    <TaskReadStatusContext.Provider value={{ markAsRead, hasUnread }}>
      {children}
    </TaskReadStatusContext.Provider>
  );
}

export function useTaskReadStatus() {
  const context = useContext(TaskReadStatusContext);
  if (!context) {
    throw new Error(
      'useTaskReadStatus must be used within a TaskReadStatusProvider'
    );
  }
  return context;
}

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';

interface SearchState {
  query: string;
  debouncedQuery: string;
  setQuery: (query: string) => void;
  active: boolean;
  clear: () => void;
  focusInput: () => void;
  registerInputRef: (ref: HTMLInputElement | null) => void;
}

const SearchContext = createContext<SearchState | null>(null);

interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Check if we're on a tasks route
  const isTasksRoute = /^\/projects\/[^/]+\/tasks/.test(location.pathname);

  // Debounce the query for filtering (150ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Clear search when leaving tasks pages
  useEffect(() => {
    if (!isTasksRoute && query !== '') {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [isTasksRoute, query]);

  // Clear search when project changes
  useEffect(() => {
    setQuery('');
    setDebouncedQuery('');
  }, [projectId]);

  const clear = () => {
    setQuery('');
    setDebouncedQuery('');
  };

  const focusInput = () => {
    if (inputRef.current && isTasksRoute) {
      inputRef.current.focus();
    }
  };

  const registerInputRef = useCallback((ref: HTMLInputElement | null) => {
    inputRef.current = ref;
  }, []);

  const value: SearchState = {
    query,
    debouncedQuery,
    setQuery,
    active: isTasksRoute,
    clear,
    focusInput,
    registerInputRef,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchState {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}

import {
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
} from '@tanstack/react-query';

/**
 * Wraps {@link useQuery} with a placeholder that reuses the previous data.
 * This keeps UI stable while refetching and centralizes the pattern.
 */
export function usePreviousDataQuery<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryResult<TData, TError> {
  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

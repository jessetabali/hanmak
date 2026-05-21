import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

/**
 * Thin wrapper around TanStack Query for GET requests.
 * @param {string|string[]} queryKey
 * @param {string} url  API endpoint path
 * @param {object} params  axios params object (query string)
 * @param {object} options  additional useQuery options
 */
export function useApiQuery(queryKey, url, params = {}, options = {}) {
  return useQuery({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
    queryFn: () => apiClient.get(url, { params }).then((r) => r.data),
    ...options,
  });
}

/**
 * Thin wrapper around TanStack Query for mutating requests (POST/PATCH/PUT/DELETE).
 * @param {function} mutationFn  receives the mutation variables and returns a promise
 * @param {object} options  additional useMutation options + optional invalidateKeys
 */
export function useApiMutation(mutationFn, { invalidateKeys = [], onSuccess, onError, ...options } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (...args) => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      onSuccess?.(...args);
    },
    onError,
    ...options,
  });
}

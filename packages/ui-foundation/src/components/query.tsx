"use client";

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState, type ReactNode } from "react";

import type { ActionResult } from "../forms/action-result.js";

/** One QueryClient per browser tab, created lazily so server renders never share it. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
          // Mutations are never retried automatically: retries must be explicit and idempotent.
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Runs a server action as a React Query mutation. A failed ActionResult is a
 * successful round-trip (the caller shows field errors); a thrown error is a
 * transport failure. On success it invalidates the given query keys and
 * refreshes server-rendered data (router.refresh) unless `refresh: false`.
 */
export function useActionMutation<TInput, TData = undefined>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  options: {
    invalidate?: readonly QueryKey[];
    refresh?: boolean;
    onSuccess?: (data: TData, message: string | undefined, input: TInput) => void;
    onFailure?: (
      result: Extract<ActionResult<TData>, { ok: false }>,
      input: TInput,
    ) => void;
  } & Omit<
    UseMutationOptions<ActionResult<TData>, Error, TInput>,
    "mutationFn" | "onSuccess"
  > = {},
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { invalidate, refresh = true, onSuccess, onFailure, ...rest } = options;
  return useMutation<ActionResult<TData>, Error, TInput>({
    mutationFn: (input) => action(input),
    ...rest,
    onSuccess: async (result, input) => {
      if (!result.ok) {
        onFailure?.(result, input);
        return;
      }
      await Promise.all(
        (invalidate ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      if (refresh) router.refresh();
      onSuccess?.(result.data, result.message, input);
    },
  });
}

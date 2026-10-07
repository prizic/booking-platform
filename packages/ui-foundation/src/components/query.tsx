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
import { runActionWithToast, type ActionToastOption } from "./action-toast.js";

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
 *
 * With `toast` it also shows a promise toast: loading while the action runs,
 * then success (a committed result, or the navigation signal of an action that
 * redirects to its outcome) or error (a refusal, or a transport failure). A
 * refusal that only carries field validation errors closes the toast silently.
 * Toasts are additive: on-page status messages and field errors still render.
 */
export function useActionMutation<TInput, TData = undefined>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  options: {
    invalidate?: readonly QueryKey[];
    refresh?: boolean;
    toast?: ActionToastOption<TData>;
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
  const { invalidate, refresh = true, toast, onSuccess, onFailure, ...rest } = options;
  return useMutation<ActionResult<TData>, Error, TInput>({
    mutationFn: (input) => runActionWithToast(action, input, toast),
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

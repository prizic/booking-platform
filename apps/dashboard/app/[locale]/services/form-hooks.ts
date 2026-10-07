"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DefaultValues, FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Keeps an editor's untouched fields and technical values (attempt id,
 * expected revision) in step with the latest server read, while the
 * operator's unsaved input survives. After a revision conflict the operator
 * reloads, sees the fresh authoritative values in every field they did not
 * change, keeps what they typed, and saves against the new revision.
 */
export function useAuthoritativeDefaults<T extends FieldValues, TOut>(
  form: UseFormReturn<T, unknown, TOut>,
  defaults: DefaultValues<T>,
): void {
  const key = JSON.stringify(defaults);
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    form.reset(JSON.parse(key) as DefaultValues<T>, { keepDirtyValues: true });
  }, [form, key]);
}

/** Shows a server-chosen result URL: a replace, or a refresh when already there. */
export function useResultNavigation(): (destination: string) => void {
  const router = useRouter();
  return useCallback(
    (destination: string) => {
      if (`${window.location.pathname}${window.location.search}` === destination)
        router.refresh();
      else router.replace(destination);
    },
    [router],
  );
}

/** A fresh attempt id for the next distinct mutation. */
export function newAttemptId(): string {
  return crypto.randomUUID();
}

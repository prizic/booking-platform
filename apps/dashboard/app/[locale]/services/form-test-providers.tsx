/*
 * Test-only wrapper: the Operate editors run React Query mutations and use the
 * App Router, so static renders in unit tests provide both.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createElement, type ReactElement } from "react";

const router = {
  back: () => undefined,
  forward: () => undefined,
  prefetch: () => undefined,
  push: () => undefined,
  refresh: () => undefined,
  replace: () => undefined,
};

export function withFormProviders(element: ReactElement): ReactElement {
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(QueryClientProvider, { client: new QueryClient() }, element),
  );
}

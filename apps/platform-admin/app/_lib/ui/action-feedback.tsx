"use client";

import type { Locale } from "@wlbp/i18n";
import { Alert, Button } from "@wlbp/ui-foundation";
import { X } from "lucide-react";
import { formCopy, say } from "../copy";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Feedback = { message: string; path: string };
const Context = createContext<{
  feedback: Feedback | null;
  announce: (message: string, path: string) => void;
  dismiss: () => void;
  locale: Locale;
} | null>(null);

/** Console-layout state survives refreshed rows and disappearing action triggers. */
export function ActionFeedbackProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const announce = useCallback(
    (message: string, path: string) => setFeedback({ message, path }),
    [],
  );
  const dismiss = useCallback(() => setFeedback(null), []);
  return (
    <Context.Provider value={{ feedback, announce, dismiss, locale }}>
      {children}
    </Context.Provider>
  );
}

export function useActionFeedback() {
  return useContext(Context);
}

export function ActionFeedbackNotice() {
  const context = useActionFeedback();
  const path = usePathname();
  if (!context?.feedback || context.feedback.path !== path) return null;
  return (
    <Alert tone="positive">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-medium">{context.feedback.message}</p>
        <Button variant="ghost" className="-my-2" onClick={context.dismiss}>
          <X aria-hidden="true" />
          {say(context.locale, formCopy.dismissMessage)}
        </Button>
      </div>
    </Alert>
  );
}

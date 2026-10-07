"use client";
import type { ReactNode } from "react";
import { RotateCw } from "lucide-react";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  formErrorMessage,
  type ActionResult,
} from "@wlbp/ui-foundation";

/**
 * The outcome of an editor's last mutation, in the operator's language:
 * failures as role=alert (with a reload offer after a revision conflict so
 * the operator can fetch the authoritative read and keep their input), an
 * optional success message as a polite status, and transport failures as the
 * "network" code.
 */
export function MutationFeedback({
  locale,
  messages,
  result,
  transportFailed,
  success,
  reload,
  extra,
}: {
  readonly locale: Locale;
  readonly messages: Readonly<Record<string, string>>;
  readonly result: ActionResult<unknown> | undefined;
  readonly transportFailed: boolean;
  readonly success?: ReactNode;
  readonly reload?: {
    readonly codes: readonly string[];
    readonly label: ReactNode;
    readonly onReload: () => void;
  };
  /** Extra content after a failure message, chosen from the failure code. */
  readonly extra?: (code: string) => ReactNode;
}) {
  if (transportFailed)
    return (
      <Alert tone="danger">
        <AlertDescription className="text-foreground">
          {formErrorMessage("network", locale, messages)}
        </AlertDescription>
      </Alert>
    );
  if (!result) return null;
  if (result.ok)
    return success ? (
      <Alert tone="positive">
        <AlertDescription className="text-foreground">{success}</AlertDescription>
      </Alert>
    ) : null;
  const code = result.formError ?? "invalid";
  return (
    <Alert tone="danger">
      <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
        <span>{formErrorMessage(code, locale, messages)}</span>
        {extra?.(code)}
        {reload && reload.codes.includes(code) ? (
          <Button variant="outline" size="sm" type="button" onClick={reload.onReload}>
            <RotateCw aria-hidden="true" />
            {reload.label}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

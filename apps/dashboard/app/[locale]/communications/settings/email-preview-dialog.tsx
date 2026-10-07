"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MailCheck, RotateCw, Send } from "lucide-react";
import type { NotificationTemplateKeyV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  formErrorMessage,
  useActionMutation,
} from "@wlbp/ui-foundation";
import {
  notificationFormMessages,
  notificationText,
  templateLabel,
} from "../../../_lib/notification-copy";
import { newAttemptId } from "../../services/form-hooks";
import { MutationFeedback } from "../../services/mutation-feedback";
import { previewNotificationEmailAction, sendTestNotificationAction } from "./actions";

type EmailLocale = "ar" | "en";

/**
 * One message rendered by the platform with sample data, in either language,
 * inside a sandboxed frame: `sandbox=""` grants nothing (no scripts, no
 * same-origin, no forms, no navigation), and the HTML arrives as `srcdoc`, so
 * the email cannot reach the Dashboard's session or DOM.
 */
function PreviewBody({
  locale,
  templateKey,
}: {
  readonly locale: Locale;
  readonly templateKey: NotificationTemplateKeyV1;
}) {
  const t = (
    key: Parameters<typeof notificationText>[1],
    values?: Record<string, string>,
  ) => notificationText(locale, key, values);
  const messages = notificationFormMessages(locale);
  const name = templateLabel(locale, templateKey);
  const [emailLocale, setEmailLocale] = useState<EmailLocale>(locale);
  const preview = useQuery({
    queryKey: ["email-preview", templateKey, emailLocale],
    queryFn: () => previewNotificationEmailAction({ locale, templateKey, emailLocale }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [attempt, setAttempt] = useState(newAttemptId);
  const test = useActionMutation(sendTestNotificationAction, {
    refresh: false,
    // The next test is a new request; a retry after a failure reuses this one.
    onSuccess: () => setAttempt(newAttemptId()),
  });
  const result = preview.data;
  const rendered = result?.ok ? result.data : null;
  const textDirection = emailLocale === "ar" ? "rtl" : "ltr";

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{t("previewTitle", { name })}</DialogTitle>
        <DialogDescription>{t("previewDescription")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <p id="email-preview-language" className="text-sm font-medium">
          {t("previewLanguage")}
        </p>
        <ToggleGroup
          type="single"
          value={emailLocale}
          aria-labelledby="email-preview-language"
          onValueChange={(value) => {
            if (value === "ar" || value === "en") setEmailLocale(value);
          }}
        >
          <ToggleGroupItem value="ar" lang="ar" className="min-h-11">
            العربية
          </ToggleGroupItem>
          <ToggleGroupItem value="en" lang="en" className="min-h-11">
            English
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {preview.isPending ? (
        <div className="grid gap-3" role="status" aria-live="polite">
          <span className="sr-only">{t("previewLoading")}</span>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-[50vh] w-full" />
        </div>
      ) : rendered ? (
        <div className="grid gap-4">
          <div className="grid gap-1 rounded-lg border bg-muted px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("previewSubject")}
            </p>
            <p
              dir={textDirection}
              lang={emailLocale}
              className="text-start font-semibold break-words"
            >
              {rendered.subject}
            </p>
          </div>
          <Tabs defaultValue="html">
            <TabsList>
              <TabsTrigger value="html" className="min-h-11">
                {t("previewHtmlTab")}
              </TabsTrigger>
              <TabsTrigger value="text" className="min-h-11">
                {t("previewTextTab")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="html" className="grid gap-2">
              <iframe
                title={t("previewFrameTitle", { name })}
                srcDoc={rendered.html}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[60vh] w-full rounded-lg border bg-background"
              />
              <p className="text-xs text-muted-foreground">{t("previewImagesNote")}</p>
            </TabsContent>
            <TabsContent value="text">
              <pre
                dir={textDirection}
                lang={emailLocale}
                tabIndex={0}
                className="max-h-[60vh] overflow-auto rounded-lg border bg-muted p-4 text-start font-sans text-sm leading-relaxed break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                {rendered.text}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Alert tone="danger">
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>
              {formErrorMessage(
                result && !result.ok
                  ? (result.formError ?? "previewFailed")
                  : "previewFailed",
                locale,
                messages,
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void preview.refetch()}
            >
              <RotateCw aria-hidden="true" />
              {t("previewRetry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 border-t pt-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("testOnlyToYou")}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            loading={test.isPending}
            loadingLabel={t("testSending")}
            onClick={() =>
              test.mutate({ locale, templateKey, emailLocale, requestId: attempt })
            }
          >
            <Send aria-hidden="true" className="rtl:-scale-x-100" />
            {t("testSend")}
          </Button>
        </div>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={test.data}
          transportFailed={test.isError}
          success={
            <span className="inline-flex items-center gap-2">
              <MailCheck aria-hidden="true" className="size-4 shrink-0" />
              {t("testQueued")}
            </span>
          }
        />
      </div>
    </div>
  );
}

export function EmailPreviewDialog({
  locale,
  templateKey,
  onClose,
}: {
  readonly locale: Locale;
  readonly templateKey: NotificationTemplateKeyV1 | null;
  readonly onClose: () => void;
}) {
  return (
    <Dialog
      open={templateKey !== null}
      onOpenChange={(open) => (open ? null : onClose())}
    >
      <DialogContent
        closeLabel={notificationText(locale, "close")}
        className="max-w-4xl"
      >
        {templateKey === null ? null : (
          <PreviewBody key={templateKey} locale={locale} templateKey={templateKey} />
        )}
      </DialogContent>
    </Dialog>
  );
}

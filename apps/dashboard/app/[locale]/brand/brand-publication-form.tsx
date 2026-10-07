"use client";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import { Button, useActionMutation, type ButtonVariant } from "@wlbp/ui-foundation";
import { ConfirmAction } from "../services/confirm-submit";
import { useResultNavigation } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";
import { previewBrandAction, publishBrandAction, rollbackBrandAction } from "./actions";
import { brandFormMessages } from "./results";
import { getDashboardMessage } from "../../_lib/copy";
import { dashboardToast } from "../../_lib/ui/use-workspace-mutation";

type Change =
  | {
      readonly kind: "publish";
      readonly brandRevisionId: string;
      readonly contentHash: string;
    }
  | {
      readonly kind: "rollback";
      readonly brandId: string;
      readonly toRevision: number;
    };

/**
 * Publishing a draft or rolling back to a retired revision changes what
 * customers see, so both are confirmed in a dialog. The confirmation literal
 * is added only by the dialog's confirm button; the server schema requires it.
 */
export function BrandPublicationForm({
  locale,
  label,
  title,
  variant = "default",
  change,
}: {
  locale: Locale;
  label: string;
  /** The question the confirmation dialog asks. */
  title: string;
  variant?: ButtonVariant;
  change: Change;
}) {
  const navigate = useResultNavigation();
  const options = {
    refresh: false,
    onSuccess: (data: { destination: string }) => navigate(data.destination),
  };
  const messages = brandFormMessages(locale);
  const publish = useActionMutation(publishBrandAction, {
    ...options,
    toast: dashboardToast(locale, {
      messages,
      success: getDashboardMessage(locale, "brandResultPublished"),
    }),
  });
  const rollback = useActionMutation(rollbackBrandAction, {
    ...options,
    toast: dashboardToast(locale, {
      messages,
      success: getDashboardMessage(locale, "brandResultRolledBack"),
    }),
  });
  const mutation = change.kind === "publish" ? publish : rollback;
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <div
      className="grid justify-items-end gap-2"
      data-brand-action={change.kind}
      {...(change.kind === "rollback" ? { "data-to-revision": change.toRevision } : {})}
    >
      <ConfirmAction
        label={label}
        variant={variant}
        pending={mutation.isPending}
        pendingLabel={m("Applying change…", "جارٍ تطبيق التغيير…")}
        title={title}
        description={m(
          "I reviewed this revision and approve changing the published presentation.",
          "راجعتُ هذه النسخة وأوافق على تغيير العرض المنشور.",
        )}
        confirmLabel={label}
        cancelLabel={m("Cancel", "إلغاء")}
        onConfirm={() =>
          change.kind === "publish"
            ? publish.mutate({
                locale,
                confirm: "yes",
                brandRevisionId: change.brandRevisionId,
                contentHash: change.contentHash,
              })
            : rollback.mutate({
                locale,
                confirm: "yes",
                brandId: change.brandId,
                toRevision: String(change.toRevision),
              })
        }
      />
      <div className="text-start">
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data?.ok === false ? mutation.data : undefined}
          transportFailed={mutation.isError}
        />
      </div>
    </div>
  );
}

/** Opens a private preview of the saved draft (sets the preview cookie first). */
export function BrandPreviewButton({
  locale,
  brandRevisionId,
  label,
}: {
  locale: Locale;
  brandRevisionId: string;
  label: string;
}) {
  const router = useRouter();
  const mutation = useActionMutation(previewBrandAction, {
    refresh: false,
    onSuccess: (data) => router.push(data.destination),
  });
  return (
    <div className="grid justify-items-end gap-2" data-brand-action="preview">
      <Button
        type="button"
        variant="outline"
        loading={mutation.isPending}
        onClick={() => mutation.mutate({ locale, brandRevisionId })}
      >
        <Eye aria-hidden="true" />
        {label}
      </Button>
      <div className="text-start">
        <MutationFeedback
          locale={locale}
          messages={brandFormMessages(locale)}
          result={mutation.data?.ok === false ? mutation.data : undefined}
          transportFailed={mutation.isError}
        />
      </div>
    </div>
  );
}

import type { WhatsAppConfigV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Facts,
  Section,
  StatusStamp,
  type StampState,
} from "@wlbp/ui-foundation";
import { whatsAppTokenReferenceFor } from "../../_lib/notification-access";
import { notificationText } from "../../_lib/notification-copy";
import { WhatsAppForm } from "./whatsapp-form";

function channelState(
  config: WhatsAppConfigV1,
): [StampState, Parameters<typeof notificationText>[1]] {
  if (config.available) return ["confirmed", "waAvailable"];
  if (config.enabled) return ["requested", "waEnabledOnly"];
  if (config.configured) return ["neutral", "waConfiguredOff"];
  return ["neutral", "waNotConfigured"];
}

/**
 * Integrations → WhatsApp. Without the plan entitlement it explains how to
 * request the channel and offers no control; with it, the setup form. The
 * explanation of how the channel works and the legal-review statement are
 * shown in both cases.
 */
export function WhatsAppSection({
  locale,
  tenantId,
  config,
}: {
  readonly locale: Locale;
  readonly tenantId: string;
  readonly config: WhatsAppConfigV1 | null;
}) {
  const t = (key: Parameters<typeof notificationText>[1]) =>
    notificationText(locale, key);
  let body;
  if (config === null)
    body = (
      <Alert tone="danger">
        <AlertDescription className="text-foreground">
          {t("waUnavailable")}
        </AlertDescription>
      </Alert>
    );
  else if (!config.entitled)
    body = (
      <div className="grid gap-2 rounded-lg border bg-card p-5 text-sm leading-relaxed">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <StatusStamp state="neutral">{t("waNotConfigured")}</StatusStamp>
          {t("waNotEntitled")}
        </p>
        <p className="text-muted-foreground">{t("waRequest")}</p>
      </div>
    );
  else {
    const [state, label] = channelState(config);
    body = (
      <>
        <div className="rounded-lg border bg-card p-5">
          <Facts
            columns={1}
            items={[
              {
                key: "status",
                label: t("waStatus"),
                value: <StatusStamp state={state}>{t(label)}</StatusStamp>,
              },
            ]}
          />
        </div>
        <WhatsAppForm
          locale={locale}
          config={config}
          attempt={crypto.randomUUID()}
          tokenReference={whatsAppTokenReferenceFor(tenantId)}
        />
      </>
    );
  }
  return (
    <Section id="integrations-whatsapp" title={t("waTitle")} description={t("waIntro")}>
      <div className="grid gap-6">
        {body}
        <div className="grid gap-3 rounded-lg border bg-card p-5 text-sm leading-relaxed">
          <h3 className="text-base font-semibold">{t("waHowTitle")}</h3>
          <ul className="grid list-disc gap-1.5 ps-5 text-muted-foreground">
            <li>{t("waHow1")}</li>
            <li>{t("waHow2")}</li>
            <li>{t("waHow3")}</li>
            <li>{t("waHow4")}</li>
          </ul>
          <p className="font-medium">{t("waLegal")}</p>
        </div>
      </div>
    </Section>
  );
}

import type { Locale } from "@wlbp/i18n";
import { PageHeader, Section } from "@wlbp/ui-foundation";
import {
  Download,
  EllipsisVertical,
  Monitor,
  MonitorDown,
  Share,
  Smartphone,
  SquarePlus,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";

import { InstallAppButton } from "../../_lib/install-app-button";
import { instanceText } from "../../_lib/instance-text";
import { pwaMessage, type PwaMessageKey } from "../../_lib/pwa-copy";
import { SiteFrame, siteContainerClass } from "../../_lib/ui/site-frame";

type InstallPageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({
  params,
}: InstallPageProps): Promise<Metadata> {
  const { locale } = await params;
  const text = instanceText(locale);
  return { title: text("pwa.install.title", { name: text("brand.name") }) };
}

interface Platform {
  readonly id: string;
  readonly title: PwaMessageKey;
  readonly steps: readonly (readonly [LucideIcon, PwaMessageKey])[];
}

/** Each step carries the icon of the control the person looks for. */
const platforms: readonly Platform[] = [
  {
    id: "install-ios",
    title: "installIosTitle",
    steps: [
      [Smartphone, "installIosStep1"],
      [Share, "installIosStep2"],
      [SquarePlus, "installIosStep3"],
    ],
  },
  {
    id: "install-android",
    title: "installAndroidTitle",
    steps: [
      [Smartphone, "installAndroidStep1"],
      [EllipsisVertical, "installAndroidStep2"],
      [SquarePlus, "installAndroidStep3"],
    ],
  },
  {
    id: "install-desktop",
    title: "installDesktopTitle",
    steps: [
      [Monitor, "installDesktopStep1"],
      [MonitorDown, "installDesktopStep2"],
      [Download, "installDesktopStep3"],
    ],
  },
];

export default async function InstallPage({ params }: InstallPageProps) {
  const { locale } = await params;
  const text = instanceText(locale);
  const message = (key: PwaMessageKey) => pwaMessage(locale, key);
  const name = text("brand.name");

  return (
    <SiteFrame locale={locale} switchPath="/install">
      <div className={`${siteContainerClass} grid gap-10 py-12 md:py-16`}>
        <PageHeader
          titleId="install-title"
          title={text("pwa.install.title", { name })}
          description={text("pwa.install.intro", { name })}
        />
        <InstallAppButton
          labels={{
            install: message("installAction"),
            installed: message("installInstalled"),
            unavailable: message("installUnavailable"),
          }}
        />
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {platforms.map((platform) => (
            <Section key={platform.id} id={platform.id} title={message(platform.title)}>
              <ol className="grid gap-4">
                {platform.steps.map(([Icon, step]) => (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="pt-1.5 text-sm leading-relaxed">
                      {message(step)}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ))}
        </div>
        <Section id="install-remove" title={message("installRemoveTitle")}>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {message("installRemoveBody")}
          </p>
        </Section>
      </div>
    </SiteFrame>
  );
}

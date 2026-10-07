import type { Locale } from "@wlbp/i18n";
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

import { AuthFrame } from "../../_lib/auth-frame";
import { InstallAppButton } from "../../_lib/install-app-button";
import { instanceText } from "../../_lib/instance-text";
import { pwaMessage, type PwaMessageKey } from "../../_lib/pwa-copy";

type InstallPageProps = {
  readonly params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({
  params,
}: InstallPageProps): Promise<Metadata> {
  const { locale } = await params;
  return { title: pwaMessage(locale, "installTitle") };
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

/** Public, like the sign-in pages: install help needs no session. */
export default async function InstallPage({ params }: InstallPageProps) {
  const { locale } = await params;
  const message = (key: PwaMessageKey) => pwaMessage(locale, key);
  const name = instanceText(locale)("brand.name");

  return (
    <AuthFrame
      locale={locale}
      titleId="install-title"
      title={message("installTitle")}
      intro={message("installIntro").replace("{name}", name)}
      path="/install"
    >
      <InstallAppButton
        labels={{
          install: message("installAction"),
          installed: message("installInstalled"),
          unavailable: message("installUnavailable"),
        }}
      />
      {platforms.map((platform) => (
        <section
          key={platform.id}
          aria-labelledby={`${platform.id}-title`}
          className="grid gap-3"
        >
          <h2 id={`${platform.id}-title`} className="text-base font-semibold">
            {message(platform.title)}
          </h2>
          <ol className="grid gap-3">
            {platform.steps.map(([Icon, step]) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
                >
                  <Icon className="size-4" />
                </span>
                <span className="pt-1 text-sm leading-relaxed">{message(step)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section
        aria-labelledby="install-remove-title"
        className="grid gap-2 border-t pt-4"
      >
        <h2 id="install-remove-title" className="text-base font-semibold">
          {message("installRemoveTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message("installRemoveBody")}
        </p>
      </section>
    </AuthFrame>
  );
}

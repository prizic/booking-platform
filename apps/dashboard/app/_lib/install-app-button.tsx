"use client";

import { Alert, AlertDescription, Button } from "@wlbp/ui-foundation";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

/** Chromium's install prompt event; not yet in the DOM type library. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallAppButtonProps {
  readonly labels: {
    readonly install: string;
    readonly installed: string;
    readonly unavailable: string;
  };
}

type InstallState = "checking" | "available" | "unavailable" | "installed";

/**
 * Offers one-tap install where the browser supports it (Chrome, Edge,
 * Android); elsewhere it says so and the manual steps on the page apply.
 */
export function InstallAppButton({ labels }: InstallAppButtonProps) {
  const [state, setState] = useState<InstallState>("checking");
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      setState("available");
    };
    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Browsers fire the prompt event soon after load, or never.
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current !== "checking" ? current : standalone ? "installed" : "unavailable",
        ),
      standalone ? 0 : 1500,
    );
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "checking") return null;
  if (state === "installed") {
    return (
      <Alert tone="positive">
        <AlertDescription className="text-foreground">
          {labels.installed}
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "unavailable" || prompt === null) {
    return <p className="text-sm text-muted-foreground">{labels.unavailable}</p>;
  }
  return (
    <div>
      <Button
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          setPrompt(null);
          setState(choice.outcome === "accepted" ? "installed" : "unavailable");
        }}
      >
        <Download aria-hidden="true" />
        {labels.install}
      </Button>
    </div>
  );
}

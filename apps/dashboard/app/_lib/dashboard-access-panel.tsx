import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wlbp/ui-foundation";
import { Building, ChevronDown, LogIn } from "lucide-react";
import Link from "next/link";
import type { DashboardAccessState } from "./dashboard-access";
import { getDashboardMessage } from "./copy";
import { workspaceMessage } from "./workspace-copy";
import { TenantSelectForm } from "./tenant-select-form";
type PageState = DashboardAccessState | { readonly kind: "configuration-missing" };

/**
 * What the workspace says when it cannot show a tenant's data yet, and the
 * tenant switcher once it can. Choosing a tenant is a server action; the
 * database decides whether the membership is still valid.
 */
export function DashboardAccessPanel({
  locale,
  state,
}: {
  locale: Locale;
  state: PageState;
}) {
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  if (state.kind === "configuration-missing") {
    return (
      <Alert tone="warning" aria-labelledby="access-title">
        <AlertTitle as="h2" id="access-title">
          {message("configurationTitle")}
        </AlertTitle>
        <AlertDescription>{message("configurationSummary")}</AlertDescription>
      </Alert>
    );
  }
  if (state.kind === "unauthenticated") {
    return (
      <Card aria-labelledby="access-title" className="max-w-xl">
        <CardHeader>
          <CardTitle id="access-title">{message("signInTitle")}</CardTitle>
          <CardDescription>{message("signInSummary")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/${locale}/auth/sign-in`}>
              <LogIn aria-hidden="true" />
              {message("authSignIn")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "denied") {
    return (
      <Alert tone="danger" aria-labelledby="access-title">
        <AlertTitle as="h2" id="access-title">
          {message("deniedTitle")}
        </AlertTitle>
        <AlertDescription>{message("deniedSummary")}</AlertDescription>
      </Alert>
    );
  }
  if (state.kind === "selection-required") {
    return (
      <section aria-labelledby="access-title" className="grid max-w-2xl gap-4">
        <div className="grid gap-1">
          <h2 id="access-title" className="text-lg font-semibold">
            {message("selectionTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{message("selectionSummary")}</p>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {state.choices.map((choice) => (
            <li key={choice.membershipId}>
              <TenantSelectForm
                locale={locale}
                tenantId={choice.tenantId}
                label={message("selectTenant")}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="grid min-w-0 gap-0.5">
                  <strong className="truncate font-semibold">
                    {choice.tenantName}
                  </strong>
                  <small dir="ltr" className="text-start text-xs text-muted-foreground">
                    {choice.roleKey}
                  </small>
                </span>
              </TenantSelectForm>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (state.choices.length < 2) return null;
  const current = state.choices.find(
    (choice) => choice.tenantId === state.context.tenantId,
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-w-56">
          <Building aria-hidden="true" />
          <span className="sr-only">
            {workspaceMessage(locale, "currentWorkspace")}:{" "}
          </span>
          <span className="truncate">
            {current?.tenantName ?? message("selectionTitle")}
          </span>
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <p className="text-sm font-semibold">{message("selectionTitle")}</p>
        <ul className="grid gap-1">
          {state.choices.map((choice) => (
            <li key={choice.membershipId}>
              <TenantSelectForm
                locale={locale}
                tenantId={choice.tenantId}
                label={message("selectTenant")}
                className="flex flex-wrap items-center justify-between gap-3"
                variant={
                  choice.tenantId === state.context.tenantId ? "ghost" : "outline"
                }
                disabled={choice.tenantId === state.context.tenantId}
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {choice.tenantName}
                </span>
              </TenantSelectForm>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

import type { Locale } from "@wlbp/i18n";
import { notFound } from "next/navigation";

import { EmptyState, Section } from "@wlbp/ui-foundation";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { RoleEditor } from "./role-editor";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

function localeOf(value: string): Locale {
  if (value !== "en" && value !== "ar") notFound();
  return value;
}

export default async function RolesPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const request = await loadDashboardRequestAccess(locale);
  const workspace =
    request.source !== null &&
    request.state.kind === "ready" &&
    request.source.listRoles
      ? await request.source.listRoles(request.state.context.tenantId).catch(() => null)
      : null;
  const catalog =
    request.source !== null &&
    request.state.kind === "ready" &&
    request.source.getRoleCatalog
      ? await request.source
          .getRoleCatalog(request.state.context.tenantId)
          .catch(() => null)
      : null;
  const ar = locale === "ar";

  return (
    <WorkspaceShell current="roles" labelledBy="roles-title" locale={locale}>
      <main
        id="main-content"
        aria-labelledby="roles-title"
        className="mx-auto grid max-w-6xl gap-8 px-4 py-8"
      >
        <header className="grid gap-2">
          <h1 id="roles-title" className="text-3xl font-semibold">
            {ar ? "الأدوار والصلاحيات" : "Roles and permissions"}
          </h1>
          <p className="text-muted-foreground">
            {ar
              ? "راجع أدوار مساحة العمل والصلاحيات التي تحملها كل منها."
              : "Review workspace roles and the permissions each one carries."}
          </p>
        </header>
        <Section
          title={ar ? "أدوار مساحة العمل" : "Workspace roles"}
          description={
            ar
              ? "الأدوار المضمنة مقفلة؛ الأدوار المخصصة تدار من خلال صلاحية role.manage."
              : "Built-in roles are locked; custom roles require the role.manage capability."
          }
        >
          {workspace === null ? (
            <EmptyState
              title={ar ? "تعذر تحميل الأدوار" : "Roles are unavailable"}
              description={
                ar
                  ? "تحقق من اتصال مساحة العمل ثم أعد المحاولة."
                  : "Check the secure workspace connection and try again."
              }
            />
          ) : (
            <>
              {catalog !== null && workspace.canManageRoles ? (
                <RoleEditor locale={locale} permissions={catalog.permissions} />
              ) : null}
              <div className="grid gap-3" data-testid="roles-list">
                {workspace.roles.map((role) => (
                  <article
                    key={role.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold">
                        {role.kind === "builtin"
                          ? role.key
                          : ar
                            ? role.nameAr
                            : role.nameEn}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {role.archived
                          ? ar
                            ? "مؤرشف"
                            : "Archived"
                          : role.kind === "builtin"
                            ? ar
                              ? "مضمن"
                              : "Built-in"
                            : ar
                              ? "مخصص"
                              : "Custom"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {role.grants.length} {ar ? "صلاحيات" : "permissions"}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </Section>
      </main>
    </WorkspaceShell>
  );
}

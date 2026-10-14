import { paginateRows } from "../../_lib/data-page-query";
import { WorkspacePagination } from "../../_lib/ui/workspace-pagination";
export const dynamic = "force-dynamic";
import { ReadRetry } from "../../_lib/ui/read-retry";
import { ChoiceSelect } from "../services/form-kit";
import type { Locale } from "@wlbp/i18n";
import { notFound } from "next/navigation";

import {
  DataPage,
  FilterBar,
  FilterField,
  Input,
  Button,
  ErrorState,
  EmptyState,
  Section,
} from "@wlbp/ui-foundation";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { ArchiveRoleButton, RoleEditor } from "./role-editor";

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function localeOf(value: string): Locale {
  if (value !== "en" && value !== "ar") notFound();
  return value;
}

export default async function RolesPage({ params, searchParams }: Props) {
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
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 100).trim() : "";
  const archived = query.archived === "yes";
  const roles =
    workspace?.roles.filter(
      (role) =>
        (archived || !role.archived) &&
        (!search ||
          `${role.key} ${role.kind === "custom" ? `${role.nameEn} ${role.nameAr}` : ""}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())),
    ) ?? [];

  const paging = paginateRows(roles, query);
  return (
    <WorkspaceShell current="roles" labelledBy="roles-title" locale={locale}>
      <DataPage
        pagination={
          workspace ? (
            <WorkspacePagination
              locale={locale}
              path={`/${locale}/roles`}
              query={query}
              {...paging}
            />
          ) : null
        }
        titleId="roles-title"
        title={ar ? "الأدوار والصلاحيات" : "Roles and permissions"}
        description={
          ar
            ? "راجع أدوار مساحة العمل والصلاحيات التي تحملها كل منها."
            : "Review workspace roles and the permissions each one carries."
        }
        toolbar={
          <FilterBar label={ar ? "التصفية" : "Filters"}>
            <FilterField
              label={ar ? "البحث في الأدوار" : "Search roles"}
              htmlFor="roles-search"
            >
              <Input
                id="roles-search"
                name="q"
                type="search"
                maxLength={100}
                defaultValue={search}
              />
            </FilterField>
            <FilterField
              label={ar ? "حالة الأدوار" : "Role status"}
              htmlFor="roles-archived"
            >
              <ChoiceSelect
                id="roles-archived"
                name="archived"
                defaultValue={archived ? "yes" : "no"}
                options={[
                  { value: "no", label: ar ? "الأدوار النشطة" : "Active roles" },
                  { value: "yes", label: ar ? "تضمين المؤرشفة" : "Include archived" },
                ]}
              />
            </FilterField>
            <Button type="submit" variant="outline">
              {ar ? "تطبيق التصفية" : "Apply filters"}
            </Button>
          </FilterBar>
        }
      >
        <Section
          title={ar ? "أدوار مساحة العمل" : "Workspace roles"}
          description={
            ar
              ? "الأدوار المضمنة مقفلة؛ الأدوار المخصصة تدار من خلال صلاحية role.manage."
              : "Built-in roles are locked; custom roles require the role.manage capability."
          }
        >
          {workspace === null ? (
            <ErrorState
              title={ar ? "تعذر تحميل الأدوار" : "Roles are unavailable"}
              retry={<ReadRetry locale={locale} />}
            />
          ) : (
            <>
              {catalog !== null && workspace.canManageRoles ? (
                <RoleEditor
                  locale={locale}
                  permissions={catalog.permissions}
                  requestId={crypto.randomUUID()}
                  idPrefix="role-new"
                />
              ) : null}
              <ul
                aria-label={ar ? "أدوار مساحة العمل" : "Workspace roles"}
                className="grid gap-3"
                data-testid="roles-list"
              >
                {roles.length === 0 ? (
                  <li>
                    <EmptyState
                      title={ar ? "لا توجد أدوار تطابق التصفية." : "No matching roles."}
                    />
                  </li>
                ) : null}
                {paging.rows.map((role) => (
                  <li key={role.id}>
                    <article
                      data-role-id={role.id}
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
                      {/* A role carrying grants this release does not know is
                        never edited or duplicated here, so a save can never
                        silently drop them. Each editor opens on request
                        inside a native disclosure instead of rendering every
                        full form up front. */}
                      {catalog !== null &&
                      workspace.canManageRoles &&
                      !role.archived ? (
                        role.kind === "builtin" || role.assignable ? (
                          <div className="mt-4 grid gap-2 border-t border-border pt-4">
                            {role.hasUnknownGrants ? (
                              <p className="text-sm text-muted-foreground">
                                {ar
                                  ? "يحمل هذا الدور صلاحيات لا يعرفها هذا الإصدار. لا يمكن تعديله أو نسخه هنا."
                                  : "This role carries permissions this release does not know. It cannot be edited or duplicated here."}
                              </p>
                            ) : (
                              <>
                                {role.kind === "custom" ? (
                                  <details
                                    className="grid gap-2"
                                    data-role-action="edit"
                                  >
                                    <summary className="min-h-11 cursor-pointer rounded-md px-1 py-2 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                                      {ar ? "تعديل الدور المخصص" : "Edit custom role"}
                                    </summary>
                                    <div className="pb-4">
                                      <RoleEditor
                                        locale={locale}
                                        permissions={catalog.permissions}
                                        requestId={crypto.randomUUID()}
                                        idPrefix={`role-edit-${role.id}`}
                                        target={{ role, source: null }}
                                      />
                                    </div>
                                  </details>
                                ) : null}
                                <details
                                  className="grid gap-2"
                                  data-role-action="duplicate"
                                >
                                  <summary className="min-h-11 cursor-pointer rounded-md px-1 py-2 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                                    {ar ? "نسخ الدور" : "Duplicate role"}
                                  </summary>
                                  <div className="pb-4">
                                    <RoleEditor
                                      locale={locale}
                                      permissions={catalog.permissions}
                                      requestId={crypto.randomUUID()}
                                      idPrefix={`role-duplicate-${role.id}`}
                                      target={{ role: null, source: role }}
                                    />
                                  </div>
                                </details>
                              </>
                            )}
                            {role.kind === "custom" ? (
                              <details
                                className="grid gap-2"
                                data-role-action="archive"
                              >
                                <summary className="min-h-11 cursor-pointer rounded-md px-1 py-2 text-sm font-semibold text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                                  {ar ? "أرشفة الدور" : "Archive role"}
                                </summary>
                                <div className="pb-4">
                                  <ArchiveRoleButton
                                    locale={locale}
                                    role={role}
                                    requestId={crypto.randomUUID()}
                                  />
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {ar
                              ? "لا تملك صلاحيات تتفوق على هذا الدور."
                              : "You do not hold permissions that cover this role."}
                          </p>
                        )
                      ) : null}
                    </article>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </DataPage>
    </WorkspaceShell>
  );
}

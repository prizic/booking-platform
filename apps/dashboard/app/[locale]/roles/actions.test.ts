import { beforeEach, describe, expect, it, vi } from "vitest";

const loadDashboardRequestAccess = vi.fn();

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("../../_lib/dashboard-server", () => ({
  loadDashboardRequestAccess: (...args: unknown[]) =>
    loadDashboardRequestAccess(...args),
}));

/*
 * Framework boundary: the production action calls `revalidatePath` after a
 * successful RPC, which throws outside a Next request context. Mock it so the
 * unit harness exercises the real success path instead of the catch branch.
 */
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { archiveRoleAction, saveRoleAction } from "./actions";

/*
 * Catalog mirrors the real seed (`20261008120000_tenant_custom_roles.sql`):
 * `booking.approve` allows own/location/tenant, `booking.view.any` allows
 * location/tenant but not own, `customer.data.correct` is tenant-only, and
 * `role.manage` is reserved. Synthetic keys would leave per-permission scope
 * fallback untested.
 */
const catalog = {
  permissions: [
    {
      allowedGrantKinds: ["direct", "approval"],
      allowedScopes: ["tenant", "location", "own"],
      group: "bookings",
      key: "booking.approve",
      reserved: false,
      sortOrder: 1,
    },
    {
      allowedGrantKinds: ["direct"],
      allowedScopes: ["tenant", "location"],
      group: "bookings",
      key: "booking.view.any",
      reserved: false,
      sortOrder: 2,
    },
    {
      allowedGrantKinds: ["direct", "approval"],
      allowedScopes: ["tenant"],
      group: "customers_privacy",
      key: "customer.data.correct",
      reserved: false,
      sortOrder: 3,
    },
    {
      allowedGrantKinds: ["direct"],
      allowedScopes: ["tenant"],
      group: "owner",
      key: "role.manage",
      reserved: true,
      sortOrder: 4,
    },
  ],
  tenantId: "b0000000-0000-4000-8000-000000000001",
};

function readySource(
  saveRole = vi.fn().mockResolvedValue(undefined),
  archiveRole = vi.fn().mockResolvedValue(undefined),
) {
  return {
    archiveRole,
    getRoleCatalog: vi.fn().mockResolvedValue(catalog),
    saveRole,
  };
}

function ready(source: ReturnType<typeof readySource>) {
  loadDashboardRequestAccess.mockResolvedValue({
    source,
    state: {
      cacheScopeKey: "k",
      choices: [],
      context: { tenantId: catalog.tenantId },
      identity: {},
      kind: "ready",
    },
  });
}

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields))
    for (const entry of Array.isArray(value) ? value : [value])
      data.append(name, entry);
  return data;
}

const base = {
  locale: "en",
  mode: "tenant",
  nameAr: "دور",
  nameEn: "Front desk",
  permission: ["booking.view.any"],
  requestId: "c0000000-0000-4000-8000-000000000001",
};

beforeEach(() => {
  loadDashboardRequestAccess.mockReset();
  revalidatePath.mockClear();
});

describe("role mutations", () => {
  /*
   * Regression: `errorMessage` branched on `error.message`, which carries only
   * the SQLSTATE ("Dashboard API failed: 42501"), so step-up and escalation copy
   * could never render and every refusal read as the generic message.
   */
  it("explains each published refusal in both languages", async () => {
    for (const [code, en] of [
      ["step_up_required", "Recent MFA is required"],
      ["escalation_denied", "beyond your own"],
      ["role_locked", "Built-in roles cannot be changed"],
      ["role_in_use", "still assigned to members"],
      ["role_scope_in_use", "has no location"],
      ["last_administrator_required", "at least one administrator"],
      ["revision_conflict", "Someone else changed this role"],
      ["role_name_taken", "already uses this name"],
      ["invalid_request", "invalid"],
      ["not_authorized", "not allowed to manage roles"],
    ] as const) {
      for (const locale of ["en", "ar"] as const) {
        const source = readySource(
          vi.fn().mockRejectedValue(new DashboardRpcError("42501", code)),
        );
        ready(source);
        const result = await saveRoleAction(form({ ...base, locale }));
        expect(result.ok, `${code}/${locale}`).toBe(false);
        expect(result.message, `${code}/${locale}`).not.toBe(
          locale === "ar" ? "تعذر حفظ الدور." : "The role could not be saved.",
        );
        if (locale === "en") expect(result.message).toContain(en);
      }
    }
  });

  it("never echoes a driver or SQL message to the operator", async () => {
    const source = readySource(
      vi
        .fn()
        .mockRejectedValue(
          new DashboardRpcError("42P01", 'relation "app.secrets" does not exist'),
        ),
    );
    ready(source);
    const result = await saveRoleAction(form(base));
    expect(result).toEqual({ message: "The role could not be saved.", ok: false });
  });

  /*
   * Regression: `saveRoleAction` sent `roleId: null, expectedRevision: null`
   * unconditionally, so editing a custom role always created a second one.
   */
  it("edits at the revision the editor was rendered from", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        roleId: "c0000000-0000-4000-8000-000000000009",
        revision: "4",
      }),
    );
    expect(source.saveRole).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        nameEn: "Front desk",
        roleId: "c0000000-0000-4000-8000-000000000009",
        sourceRoleId: null,
        tenantId: catalog.tenantId,
      }),
    );
  });

  it("creates when the editor carries no role", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(form(base));
    expect(source.saveRole).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: null,
        roleId: null,
        requestId: base.requestId,
      }),
    );
  });

  /*
   * Regression: a partial target (id without revision, revision without id,
   * or a malformed either) used to fall back to create, so a malformed edit
   * could accidentally mint a new role. It now fails closed before any RPC.
   */
  it("refuses a partial mutation target instead of creating", async () => {
    for (const fields of [
      { roleId: "c0000000-0000-4000-8000-000000000009" },
      { revision: "3" },
      { roleId: "c0000000-0000-4000-8000-000000000009", revision: "0" },
      { roleId: "c0000000-0000-4000-8000-000000000009", revision: "next" },
      { roleId: "not-a-uuid", revision: "3" },
      { sourceRoleId: "not-a-uuid" },
      { requestId: "not-a-uuid" },
    ]) {
      for (const locale of ["en", "ar"] as const) {
        const source = readySource();
        ready(source);
        const result = await saveRoleAction(form({ ...base, ...fields, locale }));
        expect(result.ok, JSON.stringify(fields)).toBe(false);
        expect(result.message, JSON.stringify(fields)).toBe(
          locale === "ar"
            ? "طلب الدور غير مكتمل. أعد التحميل وحاول مرة أخرى."
            : "This role request is incomplete. Reload and try again.",
        );
        expect(source.saveRole).not.toHaveBeenCalled();
      }
    }
  });

  it("refuses an archive without a complete target", async () => {
    const source = readySource();
    ready(source);
    const result = await archiveRoleAction(
      form({ locale: "en", requestId: base.requestId, roleId: "" }),
    );
    expect(result).toEqual({
      message: "This role request is incomplete. Reload and try again.",
      ok: false,
    });
    expect(source.archiveRole).not.toHaveBeenCalled();
  });

  /*
   * Regression: the action minted a fresh idempotency key per submit, so a
   * repeated submit created a second role. The key now travels with the
   * rendered form: the same render replays, a fresh render starts anew.
   */
  it("reuses the rendered idempotency key on save and archive", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(form(base));
    expect(source.saveRole.mock.calls[0]![0]).toMatchObject({
      requestId: base.requestId,
    });
    await archiveRoleAction(
      form({
        locale: "en",
        requestId: base.requestId,
        revision: "7",
        roleId: "c0000000-0000-4000-8000-000000000009",
      }),
    );
    expect(source.archiveRole).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: base.requestId }),
    );
  });

  it("never sends a reserved permission the catalog marks", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({ ...base, permission: ["booking.view.any", "role.manage"] }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.view.any", scope: "tenant" },
    ]);
  });

  /*
   * Regression: one scope was derived for every grant (`own` in assigned
   * mode), so tenant/location-only permissions such as `booking.view.any`
   * were silently dropped under a success message, and an all-tenant-only
   * selection degraded to a generic error.
   */
  it("derives one scope per permission in assigned mode", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        mode: "assigned",
        permission: ["booking.approve", "booking.view.any"],
      }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.approve", scope: "own" },
      { grantKind: "direct", permissionKey: "booking.view.any", scope: "location" },
    ]);
  });

  it("refuses a tenant-only selection in assigned mode instead of saving a subset", async () => {
    for (const locale of ["en", "ar"] as const) {
      const source = readySource();
      ready(source);
      const result = await saveRoleAction(
        form({
          ...base,
          locale,
          mode: "assigned",
          permission: ["booking.approve", "customer.data.correct"],
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.message).toContain("customer.data.correct");
      expect(result.message).not.toBe(
        locale === "ar" ? "تعذر حفظ الدور." : "The role could not be saved.",
      );
      expect(source.saveRole).not.toHaveBeenCalled();
    }
  });

  /*
   * Regression: the editor submitted bare permission keys, so a rename-only
   * edit silently narrowed an existing `location` grant to `own`. A submitted
   * scope the mode still allows is kept; a stale one falls back narrowest.
   */
  it("keeps a compatible submitted scope and falls back otherwise", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        mode: "assigned",
        permission: ["booking.approve"],
        "scope:booking.approve": "location",
      }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.approve", scope: "location" },
    ]);

    const stale = readySource();
    ready(stale);
    await saveRoleAction(
      form({
        ...base,
        mode: "assigned",
        permission: ["booking.view.any"],
        "scope:booking.view.any": "tenant",
      }),
    );
    expect(stale.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.view.any", scope: "location" },
    ]);
  });

  /*
   * Regression: the tenant branch pushed `tenant` unconditionally, so renaming
   * a tenant-mode role carrying an `own` grant silently broadened it to
   * `tenant` — while `grantScopeAllowedInMode` permits `own` in tenant mode.
   * A mode-compatible prior scope is now honored in BOTH modes.
   */
  it("keeps a mode-compatible prior scope in tenant mode instead of broadening", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        mode: "tenant",
        permission: ["booking.approve", "booking.view.any"],
        "scope:booking.approve": "own",
        "scope:booking.view.any": "tenant",
      }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.approve", scope: "own" },
      { grantKind: "direct", permissionKey: "booking.view.any", scope: "tenant" },
    ]);
  });

  it("keeps an own prior scope in assigned mode", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        mode: "assigned",
        permission: ["booking.approve"],
        "scope:booking.approve": "own",
      }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.approve", scope: "own" },
    ]);
  });

  /*
   * Regression: same root cause — a mode-incompatible carried-over scope must
   * choose a valid default, not trust the hint. `location` is not expressible
   * in tenant mode, so it falls back to `tenant` (the narrowest tenant-mode
   * default the permission allows).
   */
  it("falls back to a valid default for a mode-incompatible prior scope", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        mode: "tenant",
        permission: ["booking.view.any"],
        "scope:booking.view.any": "location",
      }),
    );
    expect(source.saveRole.mock.calls[0]![0].grants).toEqual([
      { grantKind: "direct", permissionKey: "booking.view.any", scope: "tenant" },
    ]);
  });

  /*
   * Regression: the key lifecycle must survive successive operations. After
   * an update the server refresh renders a new operation — fresh key plus the
   * new revision — and that update persists exactly (no stale-key reuse, no
   * revision replay).
   */
  it("persists a successive update carrying the refreshed revision and a fresh key", async () => {
    const roleId = "c0000000-0000-4000-8000-000000000009";
    const first = readySource();
    ready(first);
    const firstResult = await saveRoleAction(form({ ...base, roleId, revision: "4" }));
    expect(firstResult.ok).toBe(true);
    expect(first.saveRole).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        requestId: base.requestId,
        roleId,
      }),
    );
    const second = readySource();
    ready(second);
    const freshKey = "d0000000-0000-4000-8000-000000000002";
    const secondResult = await saveRoleAction(
      form({ ...base, roleId, revision: "5", requestId: freshKey }),
    );
    expect(secondResult.ok).toBe(true);
    expect(second.saveRole).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 5,
        requestId: freshKey,
        roleId,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/en/roles");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("prompts for at least one permission instead of failing generically", async () => {
    for (const locale of ["en", "ar"] as const) {
      const source = readySource();
      ready(source);
      const result = await saveRoleAction(
        form({
          locale,
          mode: base.mode,
          nameAr: base.nameAr,
          nameEn: base.nameEn,
          requestId: base.requestId,
        }),
      );
      expect(result).toEqual({
        message:
          locale === "ar"
            ? "اختر صلاحية واحدة على الأقل قبل الحفظ."
            : "Choose at least one permission before saving.",
        ok: false,
      });
      expect(source.saveRole).not.toHaveBeenCalled();
    }
  });

  /*
   * Regression: the editor rendered no description inputs, so every edit
   * reset both descriptions to null. They now pass through, blank to null.
   */
  it("round-trips descriptions, blank to null", async () => {
    const source = readySource();
    ready(source);
    await saveRoleAction(
      form({
        ...base,
        descriptionAr: "جدول الاستقبال",
        descriptionEn: "Front desk rota",
      }),
    );
    expect(source.saveRole.mock.calls[0]![0]).toMatchObject({
      descriptionAr: "جدول الاستقبال",
      descriptionEn: "Front desk rota",
    });

    const blank = readySource();
    ready(blank);
    await saveRoleAction(form(base));
    expect(blank.saveRole.mock.calls[0]![0]).toMatchObject({
      descriptionAr: null,
      descriptionEn: null,
    });
  });

  it("archives the named role at its revision, with no tenant from the form", async () => {
    const source = readySource();
    ready(source);
    await archiveRoleAction(
      form({
        locale: "en",
        revision: "7",
        roleId: "c0000000-0000-4000-8000-000000000009",
        tenantId: "e0000000-0000-4000-8000-0000000000ff",
      }),
    );
    expect(source.archiveRole).toHaveBeenCalledWith({
      expectedRevision: 7,
      requestId: expect.any(String),
      roleId: "c0000000-0000-4000-8000-000000000009",
      tenantId: catalog.tenantId,
    });
  });

  it("reports an unavailable workspace instead of calling anything", async () => {
    loadDashboardRequestAccess.mockResolvedValue({
      source: null,
      state: { kind: "configuration-missing" },
    });
    expect(await saveRoleAction(form(base))).toEqual({
      message: "Workspace unavailable.",
      ok: false,
    });
  });
});

"use client";

import { Button, ErrorSummary, StatusMessage, TextField } from "@wlbp/ui-foundation";
import { useActionState } from "react";
import { getAdminMessage } from "../_lib/copy";
import { createTenantAction, type CreateTenantResult } from "../_lib/tenant-actions";

export function CreateTenantForm({
  locale,
}: {
  locale: Parameters<typeof getAdminMessage>[0];
}) {
  const message = (key: Parameters<typeof getAdminMessage>[1]) =>
    getAdminMessage(locale, key);
  const [result, formAction, pending] = useActionState<
    CreateTenantResult | null,
    FormData
  >(createTenantAction, null);

  return (
    <form action={formAction}>
      <h2 id="create-tenant-title">{message("createTenantTitle")}</h2>
      {result?.kind === "error" ? (
        <ErrorSummary title={message("createTenantErrorTitle")}>
          {result.message}
        </ErrorSummary>
      ) : null}
      {result?.kind === "success" ? (
        <StatusMessage tone="positive">{message("createTenantSuccess")}</StatusMessage>
      ) : null}
      <TextField id="name" label={message("tenantNameLabel")} name="name" required />
      <TextField
        description={message("tenantBrandKeyDescription")}
        id="brandKey"
        label={message("tenantBrandKeyLabel")}
        name="brandKey"
        required
      />
      <Button loading={pending} type="submit">
        {message("createTenantSubmit")}
      </Button>
    </form>
  );
}

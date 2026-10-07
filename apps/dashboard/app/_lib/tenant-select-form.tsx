"use client";

import type { Locale } from "@wlbp/i18n";
import { Button, Form, useZodForm } from "@wlbp/ui-foundation";
import type { ComponentProps, ReactNode } from "react";

import { selectTenant } from "../[locale]/actions";
import { tenantSelectSchema } from "../[locale]/tenant-select-schema";
import { dashboardFormMessages } from "./form-messages";
import { MutationErrors } from "./ui/mutation-errors";
import { useWorkspaceMutation } from "./ui/use-workspace-mutation";

/**
 * One workspace choice. Submitting opens that workspace on its own hostname;
 * the server re-reads the caller's memberships before it redirects.
 */
export function TenantSelectForm({
  locale,
  tenantId,
  className,
  label,
  children,
  variant,
  disabled,
}: {
  readonly locale: Locale;
  readonly tenantId: string;
  readonly className?: string;
  readonly label: string;
  readonly children?: ReactNode;
  readonly variant?: ComponentProps<typeof Button>["variant"];
  readonly disabled?: boolean;
}) {
  const form = useZodForm(tenantSelectSchema, { defaultValues: { locale, tenantId } });
  const mutation = useWorkspaceMutation(selectTenant, form, { toast: false });
  return (
    <Form form={form} locale={locale} messages={dashboardFormMessages(locale)}>
      <form
        noValidate
        data-tenant-id={tenantId}
        {...(className === undefined ? {} : { className })}
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        {children}
        <Button
          type="submit"
          {...(variant === undefined ? {} : { variant })}
          disabled={disabled === true}
          loading={mutation.isPending}
        >
          {label}
        </Button>
        <MutationErrors mutation={mutation} className="basis-full" />
      </form>
    </Form>
  );
}

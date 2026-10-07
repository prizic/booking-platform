/**
 * Every Platform Admin mutation, by name: the Zod schema its form and its
 * server action share, the dialog's audit-reason minimum (when it asks for
 * one), and whether the form carries an idempotency key.
 *
 * Private to this app: schemas never move into a distributed package.
 * Server-safe and client-safe (no "use client", no server-only).
 */
import type { z } from "zod";
import { exportAuditSchema } from "./audit";
import { addDomainSchema, requestDomainVerificationSchema } from "./domains";
import {
  deactivateRunSchema,
  jobSchema,
  jobWithReasonSchema,
  provisioningRunSchema,
  requestProvisioningSchema,
} from "./operations";
import {
  addOperatorSchema,
  operatorStandingSchema,
  setOperatorRoleSchema,
} from "./operators";
import { savePlanSchema } from "./plans";
import {
  createRolloutSchema,
  registerReleaseSchema,
  rollbackRolloutSchema,
  rolloutSchema,
  rolloutWithReasonSchema,
  setReleaseStatusSchema,
} from "./releases";
import {
  integrationCheckSchema,
  saveFlagSchema,
  saveReferencesSchema,
} from "./settings";
import {
  assignSubscriptionSchema,
  clearEntitlementOverrideSchema,
  setEntitlementOverrideSchema,
  updateSubscriptionSchema,
} from "./subscriptions";
import {
  approveSupportSchema,
  requestSupportSchema,
  revokeSupportSchema,
} from "./support";
import {
  createTenantSchema,
  renameTenantSchema,
  requestTenantClosureSchema,
  setTenantStatusSchema,
} from "./tenants";

export type OperationSpec = {
  readonly schema: z.ZodObject;
  /** Minimum audit-reason length; the dialog renders a Reason field. */
  readonly reason?: number;
  /** A fresh idempotency key is generated each time the form opens. */
  readonly idempotent?: true;
};

export const operations = {
  exportAudit: { schema: exportAuditSchema },
  addDomain: { schema: addDomainSchema, idempotent: true },
  requestDomainVerification: { schema: requestDomainVerificationSchema },
  requestProvisioning: { schema: requestProvisioningSchema, idempotent: true },
  retryRun: { schema: provisioningRunSchema },
  activateRun: { schema: provisioningRunSchema },
  deactivateRun: { schema: deactivateRunSchema, reason: 10 },
  cancelJob: { schema: jobWithReasonSchema, reason: 5 },
  retryJob: { schema: jobWithReasonSchema, reason: 5 },
  approveJob: { schema: jobSchema },
  addOperator: { schema: addOperatorSchema, reason: 5 },
  setOperatorRole: { schema: setOperatorRoleSchema, reason: 5 },
  disableOperator: { schema: operatorStandingSchema, reason: 5 },
  enableOperator: { schema: operatorStandingSchema, reason: 5 },
  savePlan: { schema: savePlanSchema, reason: 5 },
  registerRelease: { schema: registerReleaseSchema, idempotent: true },
  setReleaseStatus: { schema: setReleaseStatusSchema, reason: 5 },
  createRollout: { schema: createRolloutSchema, reason: 5, idempotent: true },
  startRollout: { schema: rolloutSchema },
  pauseRollout: { schema: rolloutWithReasonSchema, reason: 5 },
  cancelRollout: { schema: rolloutWithReasonSchema, reason: 5 },
  rollbackRollout: { schema: rollbackRolloutSchema, reason: 10 },
  retryRollout: { schema: rolloutSchema },
  saveFlag: { schema: saveFlagSchema, reason: 5 },
  saveReferences: { schema: saveReferencesSchema },
  requestIntegrationCheck: { schema: integrationCheckSchema },
  assignSubscription: { schema: assignSubscriptionSchema, reason: 5 },
  updateSubscription: { schema: updateSubscriptionSchema, reason: 5 },
  setEntitlementOverride: { schema: setEntitlementOverrideSchema, reason: 5 },
  clearEntitlementOverride: { schema: clearEntitlementOverrideSchema, reason: 5 },
  requestSupport: { schema: requestSupportSchema, reason: 10 },
  approveSupport: { schema: approveSupportSchema },
  revokeSupport: { schema: revokeSupportSchema, reason: 5 },
  createTenant: { schema: createTenantSchema, idempotent: true },
  renameTenant: { schema: renameTenantSchema },
  setTenantStatus: { schema: setTenantStatusSchema, reason: 10 },
  requestTenantClosure: {
    schema: requestTenantClosureSchema,
    reason: 10,
    idempotent: true,
  },
} as const satisfies Record<string, OperationSpec>;

export type OperationKey = keyof typeof operations;
export type OperationInput<K extends OperationKey> = z.input<
  (typeof operations)[K]["schema"]
>;

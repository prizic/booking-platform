import { exportAuditAction } from "../actions/audit";
import { addDomainAction, requestDomainVerificationAction } from "../actions/domains";
import {
  activateRunAction,
  approveJobAction,
  cancelJobAction,
  deactivateRunAction,
  requestProvisioningAction,
  retryJobAction,
  retryRunAction,
} from "../actions/operations";
import {
  addOperatorAction,
  disableOperatorAction,
  enableOperatorAction,
  setOperatorRoleAction,
} from "../actions/operators";
import { savePlanAction } from "../actions/plans";
import {
  cancelRolloutAction,
  createRolloutAction,
  pauseRolloutAction,
  registerReleaseAction,
  retryRolloutAction,
  rollbackRolloutAction,
  setReleaseStatusAction,
  startRolloutAction,
} from "../actions/releases";
import {
  requestIntegrationCheckAction,
  saveFlagAction,
  saveReferencesAction,
} from "../actions/settings";
import {
  assignSubscriptionAction,
  clearEntitlementOverrideAction,
  setEntitlementOverrideAction,
  updateSubscriptionAction,
} from "../actions/subscriptions";
import {
  approveSupportAction,
  requestSupportAction,
  revokeSupportAction,
} from "../actions/support";
import {
  createTenantAction,
  renameTenantAction,
  requestTenantClosureAction,
  setTenantStatusAction,
} from "../actions/tenants";
import type { OperatorActionResult } from "../operator-result";
import type { OperationInput, OperationKey } from "../schemas";

/**
 * The server action behind each operation. The mapped type proves at compile
 * time that every action accepts exactly its schema's input.
 */
export const operationActions: {
  [K in OperationKey]: (input: OperationInput<K>) => Promise<OperatorActionResult>;
} = {
  exportAudit: exportAuditAction,
  addDomain: addDomainAction,
  requestDomainVerification: requestDomainVerificationAction,
  requestProvisioning: requestProvisioningAction,
  retryRun: retryRunAction,
  activateRun: activateRunAction,
  deactivateRun: deactivateRunAction,
  cancelJob: cancelJobAction,
  retryJob: retryJobAction,
  approveJob: approveJobAction,
  addOperator: addOperatorAction,
  setOperatorRole: setOperatorRoleAction,
  disableOperator: disableOperatorAction,
  enableOperator: enableOperatorAction,
  savePlan: savePlanAction,
  registerRelease: registerReleaseAction,
  setReleaseStatus: setReleaseStatusAction,
  createRollout: createRolloutAction,
  startRollout: startRolloutAction,
  pauseRollout: pauseRolloutAction,
  cancelRollout: cancelRolloutAction,
  rollbackRollout: rollbackRolloutAction,
  retryRollout: retryRolloutAction,
  saveFlag: saveFlagAction,
  saveReferences: saveReferencesAction,
  requestIntegrationCheck: requestIntegrationCheckAction,
  assignSubscription: assignSubscriptionAction,
  updateSubscription: updateSubscriptionAction,
  setEntitlementOverride: setEntitlementOverrideAction,
  clearEntitlementOverride: clearEntitlementOverrideAction,
  requestSupport: requestSupportAction,
  approveSupport: approveSupportAction,
  revokeSupport: revokeSupportAction,
  createTenant: createTenantAction,
  renameTenant: renameTenantAction,
  setTenantStatus: setTenantStatusAction,
  requestTenantClosure: requestTenantClosureAction,
};

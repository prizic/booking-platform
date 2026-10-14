import { z } from "zod";
const id = z.string().uuid();
const nullableId = id.nullable();
const state = z.enum(["provisioning", "active", "suspended", "closed"]);
export const instanceConfigurationSchema = z.object({
  instance_id: id,
  tenant_id: id,
  display_name: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  deployment_state: state,
});
export const reviewItemSchema = z.object({
  kind: z.enum(["job", "support"]),
  id,
  tenant_id: nullableId,
  instance_id: nullableId,
  status: z.string(),
  requested_by: nullableId,
  requested_at: z.string(),
  reason: z.string().nullable(),
  action: z.string(),
  tenant_name: z.string().nullable().optional(),
});
export const reviewDetailSchema = reviewItemSchema.extend({
  detail: z.record(z.string(), z.unknown()),
  history: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      operator_id: nullableId,
      reason: z.string().nullable(),
      outcome: z.string(),
      created_at: z.string(),
    }),
  ),
  can_decide: z
    .boolean()
    .nullable()
    .transform((value) => value === true),
});
const requestResult = z.object({ job_id: id, status: z.literal("awaiting_approval") });
export const operatorJsonContracts = {
  get_instance_configuration_v1: instanceConfigurationSchema,
  update_instance_configuration_v1: instanceConfigurationSchema,
  deactivate_instance_by_id_v1: z.object({
    instance_id: id,
    deployment_state: z.literal("suspended"),
    run_id: nullableId,
  }),
  request_instance_closure_v1: requestResult,
  request_domain_retirement_v1: requestResult,
  list_operator_reviews_v1: z.object({
    items: z.array(reviewItemSchema),
    total_count: z.number().int().nonnegative(),
  }),
  get_operator_review_v1: reviewDetailSchema,
  decide_operator_review_v1: z.object({
    kind: z.enum(["job", "support"]),
    id,
    status: z.enum(["approved", "rejected"]),
  }),
} as const;
export type OperatorJsonFunction = keyof typeof operatorJsonContracts;
export type OperatorJsonReturn<F extends OperatorJsonFunction> = z.output<
  (typeof operatorJsonContracts)[F]
>;
export type InstanceConfiguration = z.output<typeof instanceConfigurationSchema>;
export type OperatorReview = z.output<typeof reviewItemSchema>;
export type OperatorReviewDetail = z.output<typeof reviewDetailSchema>;
/** New wrappers are scalar JSON objects. Do not coerce table arrays or malformed data to emptiness. */
export function normalizeOperatorJson<F extends OperatorJsonFunction>(
  fn: F,
  data: unknown,
): OperatorJsonReturn<F> {
  return operatorJsonContracts[fn].parse(data) as OperatorJsonReturn<F>;
}
export function hasOperatorJsonContract(fn: string): fn is OperatorJsonFunction {
  return Object.hasOwn(operatorJsonContracts, fn);
}

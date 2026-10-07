import { z } from "zod";

import { linkTokenField } from "../../_lib/schema-primitives";

/**
 * `POST /api/proposals`: the customer's answer to a staff-proposed time. The
 * link is a bearer credential for exactly one decision, so nothing but a well
 * formed token and one of two answers is accepted.
 */
export const proposalResponseSchema = z.object({
  action: z.enum(["accept", "decline"], { error: "invalid" }),
  actionToken: linkTokenField,
});

export type ProposalResponseInput = z.input<typeof proposalResponseSchema>;

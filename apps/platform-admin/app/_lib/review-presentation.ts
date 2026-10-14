import { reviewCopy } from "./lifecycle-copy";

export function reviewApprovalCopy(review: { kind: string; action: string }) {
  if (review.kind === "support") return reviewCopy.supportApproved;
  if (review.action === "retire_domain") return reviewCopy.retirementApproved;
  return reviewCopy.approved;
}

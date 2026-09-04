# NNNN. Title in sentence case

Purpose: the template for a new architecture decision record — copy it to `NNNN-kebab-title.md` and replace every placeholder.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md). Cite the section this decision sits under, and state explicitly if the decision departs from it.

- **Owner:** Name of the one person accountable. Not a team.
- **Status:** Proposed | Accepted | Superseded
- **Date:** YYYY-MM-DD — date of the last status change.

## Context

<!-- The forces in play: constraints, requirements, deadlines, existing commitments, what makes this
     choice non-obvious. Enough that a newcomer needs no other document. Facts and pressures only —
     no decision yet. If this supersedes an earlier ADR, link it here. -->

## Decision

<!-- What was decided, active voice, present tense: "We use X." Then the alternatives considered and
     the specific reason each lost. An alternative with no stated reason for losing was not considered. -->

## Consequences

<!-- What this makes easy, what it makes hard, what it forecloses, and what new work it creates.
     Include the bad consequences — an ADR with only upsides is unfinished. Call out any effect on
     tenant isolation, booking atomicity, the distribution boundary, the merchant model, or
     English/Arabic parity. -->

## Revisit triggers

<!-- Concrete, observable events that mean this decision must be reopened, one per line. Not
     "periodically" and not "if it becomes a problem". Examples of the right shape: a named vendor
     limit is reached; a second currency is added; a stated latency or error budget is breached. -->

-
-

## References

<!-- Spec sections, related ADRs, and external sources. Vendor limits, pricing, feature availability,
     and legal statements are POINT-IN-TIME — record the date checked and revalidate before relying
     on them. See ../references.md. Never put credentials, tokens, or customer data in an ADR. -->

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md)
- [References](../references.md)
- [ADR index](./README.md)

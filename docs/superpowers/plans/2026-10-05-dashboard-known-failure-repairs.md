# Bounded repair register

The retained October 5 reports are the failure evidence. These repairs are queued for the final campaign, not claimed verified.

- Direct control-plane grants violate the existing private-schema contract. The September 30 API wrappers now use definer rights and authorize the original caller internally; remove their unnecessary application-role owner grants. Keep the blanket direct-schema assertions and verify actual non-operator API refusals.
- Exposed definer inventory: permit only the exact public-catalog and reviewed operator/worker signatures. Keep empty-search-path checks, application-role worker denial, and live caller checks. Unknown additional definer wrappers still fail.
- Guest cancellation fixture: its booking date is the next civil Monday plus fourteen days, so a fixed fourteen-day cutoff is outside the boundary on most weekdays. Derive the fixture cutoff from its actual future instant, assert the persisted snapshot is inside it, retain the guest policy-denied assertion and staff revision-one cancellation. No cancellation engine change is justified by this evidence.
- Exported Playwright config resolution: use the distributed testing package’s declared local executable, rather than assume a root executable exists in the sanitized fixture. Preserve the listing and all five project coverage checks.
- Generated API types: regenerate only from the isolated fully migrated stack using the existing generator, inspect the semantic diff, and run the strict check.

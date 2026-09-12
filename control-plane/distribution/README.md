# Distribution boundary

Reserved for the allowlist export pipeline defined by ADR-0011. Issue #3
validates the dependency closure; export automation is owned by issue #35.

## Building the export (issue #29)

`pnpm build:distribution` materializes the sanitized tree into `dist-distribution/`
and writes `distribution-manifest.json` beside it. It is part of `pnpm check`, so
a change that would leak private code fails the ordinary gate rather than the
release.

**Allowlist, never denylist.** The export set is the ADR-0011 `distributed`
classification plus a proof that its dependency closure stays inside that set. A
package that becomes reachable from the Client tomorrow either joins the
allowlist deliberately or fails the build; a denylist would silently ship it.

**The scan is not the safety net — the allowlist is.** The scan exists because a
file inside an allowlisted member can still say something it should not, and
because "we checked" is a claim worth being able to make about the bytes that
actually shipped rather than about the source they came from. Exactly one file is
exempt from it, `instance-template/.platform/customization-policy.json`, whose
whole job is to enumerate the paths an instance may never touch.

**The lockfile is pruned, not copied.** The workspace lockfile names every member
including the platform-only ones, so shipping it verbatim would leak the private
package list. Importer blocks for non-distributed members are removed; resolved
entries left behind in `packages:` are spare rather than wrong, and removing them
would mean re-resolving the graph, which is a different job with a different
failure mode.

**No migrations, by absence rather than by rule.** `supabase/` is not copied, so a
distributed instance has no mechanism to run a shared production migration — there
is nothing to run.

**It writes; it does not push.** The separate-history repository, its remote and
the signing key belong to issues #30 and #31. A build step that can push is a
build step that can push by accident.

The manifest carries a per-file SHA-256 and one `treeSha256` over every path and
checksum, so a single tampered byte or a single added file changes it.

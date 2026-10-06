# Brand asset upload refinement

The shared asset parser accepts validated PNG paths, and the deployment
materialization pipeline owns deployed files. No authorized tenant upload
endpoint is present. The editor preserves those paths and states this boundary.

A future endpoint must check live brand.manage and recent MFA; cap file size and
pixel dimensions; decode/re-encode PNG bytes; refuse SVG, MIME mismatches,
animation and traversal; bind the resulting asset to tenant/revision; record a
redacted audit; and publish through the existing materialization/deployment
owner. It must never give Dashboard a Storage admin credential. Acceptance must
cover invalid images, cross-tenant binding, expired upload context, stale hash,
and failed deployment without falsely advertising instant asset replacement.

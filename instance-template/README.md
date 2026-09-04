# Instance template

This is generator input, not a deployable tenant repository. The private
distribution pipeline renders it together with only `apps/client`,
`apps/dashboard`, and the approved package dependency closure.

The generated repository receives the instance configuration, operating docs,
agent contract, and `.platform` ownership metadata represented here. Values in
this directory are deliberately synthetic and are replaced during provisioning.

`instance/manifest.template.json` contains tenant-specific generator inputs.
Provisioning stamps `whiteLabelVersion`, `configSchemaVersion`, and
`backendContract` from the one authority at root, `platform-contract.json`, to
produce the generated repository's final `instance/manifest.json`.

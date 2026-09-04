# Platform-owned Supabase tree

This is the private source of truth for the shared backend:

- `config.toml` defines the reproducible local stack.
- `migrations/` is the ordered, central migration history.
- `tests/database/` contains pgTAP database tests.
- `functions/` is the platform-only Edge Function source surface.
- `seed.sql` contains deterministic synthetic local/CI data only.

Use the root wrappers (`pnpm supabase:start`, `pnpm db:reset`,
`pnpm test:db`, `pnpm db:lint`, and `pnpm supabase:stop`) so local commands and
CI use the workspace-pinned CLI.

The issue #4 headless stack keeps Studio, Storage, and Realtime disabled. They
are not required for migration, Auth, REST, or Edge Function contract checks;
each is enabled later only with its owning schema, publication/bucket policy,
and access tests. Hosted Supabase projects still provide those managed products
when a reviewed feature begins using them.

Only the private serialized platform pipeline may apply hosted migrations or,
after deterministic function checksums become part of the release manifest,
deploy Edge Functions. The issue #4 pipeline fails closed if an entry point is
added before that contract exists. Generated instance repositories receive none
of this directory, no production migration history, no function secrets, and
no deployment authority.

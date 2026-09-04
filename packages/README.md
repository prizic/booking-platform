# Package interfaces

Each workspace package exposes a reviewed public entry point at its package
name (`@wlbp/booking-domain`, `@wlbp/i18n`, and so on). Consumers import that
name or an explicitly declared public export only. Imports from `src/`,
`internal/`, `lib/`, `dist/`, or an undeclared deep path are private
implementation access and fail the workspace boundary gate.

`@wlbp/supabase-client` deliberately declares `/browser` and `/server` public
exports. The browser entry carries `use client`; the request-scoped entry
carries `server-only`. The root entry exports shared types and no constructor,
so a Client Module cannot pull request-cookie code into its bundle.

Keep an interface narrow and intentional. A public entry point may re-export a
small set of related types and functions, but it must not become a convenience
barrel over unrelated internal modules. Package tests exercise the public
interface wherever possible; implementation-local tests may sit beside private
code only when that code is not observable through the public seam.

Distribution classification is explicit in every `package.json` under
`wlbp.distribution`. A distributed package may depend only on other distributed
packages. Platform-only packages never enter the Client or Dashboard dependency
closure.

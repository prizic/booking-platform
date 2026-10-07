# Payment onboarding contract refinement

get_payment_account_status_v1 requires integration.manage and AAL2. The new protected platform endpoint obtains a narrow intent through the caller's JWT, requiring live direct tenant integration.manage and a recent second factor. It verifies the active Dashboard domain and immutable existing tenant/Stripe account mapping. Return destinations come from that verified domain and the allowlisted locale.

A platform worker reads only the authorized short-lived intent, creates the hosted Stripe account link with a stable provider idempotency key, accepts only HTTPS connect.stripe.com destinations, and records a redacted outcome without persisting or logging the link. Provider secrets remain under supabase/functions. Missing, suspended, and disconnected account mappings need platform provisioning/review; this editor does not manufacture an account or claim connection on redirect.

Provider contract: https://docs.stripe.com/api/account_links/create. An expired link returns to the Integrations owner, which rechecks membership/MFA and offers a fresh explicit attempt. The actual authoritative account status is reread after return. Provider synchronization remains owned by the existing commerce workers.

Tests must cover scope/MFA refusal, malicious return domains, revoked membership before worker read, request collision, provider failure, expired intent, and secret-free bundles. Deployment, sandbox configuration, and real provider evidence remain pending.

# Validation gate: independent purchases

The implementation is prepared, not approved for deployment. Migration 0043 has
only been generated. No existing database or real Webpay transaction is needed
for these tests. Do not start the updated backend against an unmigrated database.

## Safe checks (no database)

From `backend`: `npm run build`, then
`node --test tests/independentCheckout.unit.mjs tests/webpayReturn.unit.mjs tests/webpayLifecycle.unit.mjs`.
From `frontend`: `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`.
Browser tests `independent-purchases.browser.mjs`, `orders-refresh.browser.mjs`
and `checkout-single-confirmation.browser.mjs` intercept all APIs and Webpay;
set `FYF_PLAYWRIGHT_MODULE` to an available local Playwright module if needed.

## Future PostgreSQL execution: requires separate explicit approval

Only after approval, set `FYF_ALLOW_DISPOSABLE_DB_TESTS=1` for the test process
and run `node tests/paymentRecovery.integration.mjs` from `backend`.
The harness creates its own cluster in a temporary directory, binds loopback
port 55466, verifies its real data directory/port, and overrides DATABASE_URL only
inside that process. It never uses an existing database. Webpay and mail are fake.

It builds all tables, indexes, checks, NOT NULL/unique/primary/foreign-key
constraints from the versioned snapshot, not a reduced schema. Optional
`FYF_ALLOW_DISPOSABLE_MIGRATION_TEST=1` additionally requires authorization to
apply migration 0043 inside this disposable cluster: it starts from snapshot
0042 and applies only the new SQL. Never set these flags for existing databases.

The test covers independent orders, request-key conflicts, concurrent submissions,
retry isolation, stock reservations, late authorization, callbacks, unknown results,
status-query leases, more than 50 candidates and provider-window exhaustion.
The database tests and actual service restart/recovery remain unexecuted until
approval. A rollout requires observing them pass, including the 0042-to-0043 path.

## Deliberately conservative behavior

- Repeating a checkout key never returns a previously launched Webpay token.
- Legacy orders with no request hash cannot be replayed as new checkouts.
- Guest email proof remains one-purchase and must be valid for each new checkout.
- A missing/changed local cart snapshot leaves the cart unchanged.
- Financial uncertainty never becomes failure just because time or stock expires.
- After the provider query window, automatic queries stop and unresolved orders
  require operational review; no new charge for that order is authorized.
- The status-query schedule is durable, but scheduling fairness and multi-process
  races still require the disposable PostgreSQL tests before release.

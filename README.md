# Rotation Rehearsal

1Password manages passwords and developer secrets, including scoped service accounts. This independent project explores an inferred gap between vault-side rotation and application-side convergence: an application can keep a cached credential after the vault changes. It does not claim that 1Password lacks rotation, runtime injection, or usage reporting.

This runnable prototype uses **four real loopback HTTP servers**: an authority and three consumers. Each consumer caches one fictional token generation and authenticates to the authority over HTTP when probed. No 1Password account, API, real secret, inference model, or external service is involved.

## Run

Node.js 22+; tested on Node 24.22.1/Linux. No dependencies or installation.

```sh
node --test
node cli.mjs
node cli.mjs > /tmp/rehearsal.json
```

`npm test` and `npm run demo` are aliases. Servers bind ephemeral ports on `127.0.0.1`; the demo shuts them down, including concurrent close callers.

## What works

The authority temporarily accepts generations 1 and 2. The immediate-revocation baseline revokes generation 1 while all consumers still cache it. The staged experiment refreshes two consumers, detects the remaining stale generation, refreshes the third, checks fresh authenticated acknowledgements, and then revokes the old generation in the local fixture.

The assessment requires exactly one fresh observation per **opaque consumer identity** in an explicit inventory. Missing, duplicate, future-dated, stale, malformed or wrong-identity observations remain unknown. Fresh evidence of an old or rejected generation is unsafe. Every declared consumer authenticating successfully with the target generation produces `ready` for that inventory. Unrelated consumers sharing a display name cannot satisfy it.

[benchmarks/demo.json](benchmarks/demo.json) is actual local HTTP output: immediate revocation produced three rejected probes; staged rollout detected the cached consumer, returned unknown for missing/stale telemetry, reached ready, and produced zero rejected probes after revocation. These are counts from authored local scenarios, not production performance or security guarantees. Five test groups cover these outcomes and negative controls. Reports contain generations and identities, never the fictional bearer strings.

## Scope and limits

The inventory is declared, not discovered. Readiness is a point-in-time observation and cannot prove sleeping, uninstrumented, newly deployed or omitted consumers have migrated. Observation authenticity is assumed inside this controlled process; a future importer must verify identity, timestamp and provenance. The public local laboratory's `revoke` method deliberately permits unsafe revocation for the baseline; assessment is advisory, not a credential gateway. Tokens are predictable fiction. Do not use this authority for real authentication.

This component coordinates HTTP and evidence in Node ESM with runtime validation. There is no inference compute path requiring C++. The next milestone is an authenticated observation adapter, persisted rollout checkpoints and read-only 1Password metadata mapping. Real rotation or revocation requires separately scoped integration and validation. GitHub Actions is prepared but has not run remotely.

## Sources and overlap

- [1Password service accounts](https://www.1password.dev/service-accounts): scoped nonhuman access and reporting.
- [Events API](https://www.1password.dev/events-api): account activity and item-use observations.
- [Runtime secret references](https://developer.1password.com/docs/cli/secrets-scripts): existing runtime injection.

Sources informed the opportunity; the application-convergence experiment is our inference. This project is unaffiliated with 1Password.

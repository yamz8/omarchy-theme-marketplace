# Engagement Worker

This Cloudflare Worker stores anonymous aggregate marketplace engagement in D1.
It records three actions:

- `view`: a successfully rendered theme detail page with a best-effort repeat guard
- `copy`: a successful theme command copy action with a best-effort repeat guard
- `heart`: an anonymous positive reaction with a best-effort repeat guard

These values describe marketplace activity. They are not downloads, installations,
unique people, verified votes, quality signals, or security signals.

## Privacy and trust boundary

The application does not persist accounts, cookies, browser identifiers, IP addresses,
user-agent strings, command text, repository URLs, or theme metadata in D1 or application
tables. Event bodies contain only a catalog theme ID and the fixed action type. D1 stores
anonymous theme-level aggregates only. Cloudflare processes normal request metadata and
uses the request IP only for ephemeral abuse controls under the account's configuration.

The public API contains no credentials. D1 is available only through the Worker binding.
Keep the real `wrangler.jsonc`, `.dev.vars`, local Wrangler state, and all credentials out
of version control.

## Local configuration

Copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc`, create the D1 database,
and replace every `REPLACE_WITH_...` placeholder with the matching local identifier or
positive limit. Replace the quoted rate-limit placeholder, including its quotes, with a
positive JSON integer. Apply all migrations before starting the Worker on
`127.0.0.1:8787`.

The production custom-domain route is intentionally commented out in the template.
Verify a workers.dev deployment before configuring a custom domain. The current personal
deployment uses `https://omarchy-theme-engagement.yam-68e.workers.dev` and does not assume
an Omarchy-controlled API hostname.

Set `CATALOG_URL` to the published theme catalog and `ALLOWED_ORIGINS` to a comma-separated
list of exact production origins. Local marketplace origins on ports `4173` are allowed by
default. The checked-in site configures the reviewed personal endpoint on `site/index.html`
and `site/theme.html`. Disable and re-review that endpoint and the exact allowed origins
before changing the site hostname, Worker hostname, or repository owner.

## API

- `GET /v1/stats` returns aggregate counts keyed by theme ID.
- `POST /v1/events` accepts `{ "themeId": "...", "type": "view" }`,
  `{ "themeId": "...", "type": "copy" }`, or
  `{ "themeId": "...", "type": "heart" }` from an allowed marketplace origin.

The Worker validates theme IDs against the published marketplace catalog and applies
best-effort abuse controls before accepting an event. It never writes request-derived
limit keys to D1. Public stats are cached at the edge for up to five minutes, while browser
storage is disabled and successful event responses return authoritative fresh counts for
immediate UI feedback.

Anonymous public counters remain inherently susceptible to slow or distributed
manipulation. Browser guards and rate limits are best-effort controls that can be cleared,
distributed, or bypassed. Hearts must be presented as anonymous reactions, never as
unique or verified votes, trust, or quality rankings.

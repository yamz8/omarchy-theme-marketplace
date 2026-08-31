# Repository guidelines

This file defines the working rules for the entire repository. Follow a direct maintainer instruction when it conflicts with this file. Communicate in the language used by the maintainer. Keep source code, interface copy, and public project documentation in English.

## Product intent

Omarchy Theme Marketplace is an independent community catalog for themes built for Omarchy's native theme system. It is not a plugin catalog, a website-theme gallery, or an official Omarchy service.

The project currently lives under `yamz8/omarchy-theme-marketplace`. A future maintainer proposal may request placement alongside `plugins.omarchy.org`, but do not imply affiliation, an accepted domain, an organization transfer, or endorsement before that proposal is approved.

Preserve these product qualities:

- minimal, precise, technical, and aesthetically restrained;
- command-first, with source and trust information visible;
- fast, static, accessible, and usable without an application server;
- curated, while stating clearly that listing is not a security review;
- based on real Omarchy theme repositories, paths, slugs, and commands.

Do not introduce accounts, a database, a backend, a frontend framework, or a new dependency unless the maintainer explicitly approves that architectural change. The approved exception is the optional credential-free service under `worker/`, which may store anonymous aggregate theme detail views, successful command-copy actions, and hearts by catalog theme ID. Hearts are anonymous reactions, not unique or verified votes. Do not expand it into identity, profiling, comments, ratings, installation telemetry, or general analytics. Production engagement remains disabled until a reviewed endpoint and exact allowed origins are explicitly configured; deployment requires separate approval.

## Sources of truth

- `site/index.html` contains the theme marketplace and catalog interface.
- `site/explore.html` contains the palette atlas and catalog-growth interface.
- `site/theme.html` contains the theme detail shell.
- `site/develop.html` documents the native theme repository contract.
- `site/publish.html` contains the publishing guide.
- `site/assets/css/style.css` is the shared visual system.
- `site/assets/css/explore.css` contains Explore-specific styles.
- `site/assets/js/shared.js` contains shared browser behavior.
- `site/assets/js/engagement.js` contains the optional credential-free theme engagement client.
- `site/assets/js/app.js`, `theme.js`, `explore.js`, and `static-page.js` contain page behavior.
- `site/assets/js/theme-color.js` contains shared palette math for Explore.
- `registry.json` is the curated source registry.
- Upstream `colors.toml` and theme assets are the theme-owned sources.
- `scripts/theme-domain.mjs` owns theme slug, command, palette, and tree rules.
- `scripts/build-catalog.mjs` resolves GitHub snapshots and generates the catalog and previews.
- `scripts/build-explorer-data.mjs` derives palette and growth data.
- `site/catalog.json`, `site/explorer-data.json`, and `site/assets/img/themes/` are generated outputs.
- `test/theme-*.test.js` covers the current theme domain, catalog, site, and Explore contracts.
- `SECURITY.md`, `VERIFICATION.md`, and `SUBMISSION.md` define the public trust and publication contract.
- `PLAN.md` is the living implementation roadmap.
- `worker/src/index.js`, `worker/migrations/`, and `worker/wrangler.example.jsonc` define the optional theme engagement service and deployment template.

Do not manually edit generated catalog data or preview assets. Change the registry, upstream source, or build logic, then regenerate. Do not include unrelated upstream catalog drift in a focused UI change.

Use `npm ci` for reproducible installs and CI. Do not hand-edit `package-lock.json`. Update `package.json` and regenerate the lockfile together only when a lockfile-represented field changes. Script-only changes can legitimately leave the lockfile unchanged.

## Omarchy theme contract

Community sources are public GitHub repository roots. The standard command is:

```bash
omarchy theme install https://github.com/owner/omarchy-name-theme
```

The installed slug removes the case-sensitive `omarchy-` prefix and `-theme` suffix from the repository name, then lowercases the result. Community themes install under `~/.config/omarchy/themes/<slug>`.

Built-in themes are discovered from the configured Omarchy `themes/` source and selected with:

```bash
omarchy theme set <slug>
```

Locally packaged built-in themes live under `/usr/share/omarchy/themes/<slug>`.

A compatible theme has a root `colors.toml`, at least one supported image directly under `backgrounds/`, and a usable preview source. A root README and license are required for new community submissions. Omarchy derives supported application configuration from `colors.toml`; do not treat root Lua files, symlinks, or pre-generated terminal/editor configuration as installed theme behavior.

The normal community install command obtains mutable upstream and cannot be bound to the exact checked catalog SHA. Always label the command as current upstream and expose the exact inspected source separately. Built-in selection uses the version in the user's locally installed Omarchy package.

## Change workflow

1. Run `git status --short --branch` before editing.
2. Read the relevant source, tests, and nearby patterns.
3. Make the smallest coherent change that solves the request.
4. Preserve unrelated maintainer changes in a dirty worktree.
5. Verify the change according to its risk.
6. Report changed behavior, verification, and remaining limitations.

Avoid broad cleanup, formatting passes, unrelated renamed files, and dependency updates during a focused change. Ask before expanding into a different architecture.

When asked only to inspect, audit, diagnose, or verify, do not edit, regenerate, commit, amend, push, or open external requests. Read-only commands, tests, temporary local servers, and screenshots under `/tmp` are allowed when needed.

## Frontend and design rules

Reuse the existing HTML, CSS, JavaScript, tokens, and components before adding new patterns.

Preserve:

- monospace typography for navigation, commands, identifiers, and technical metadata;
- black and neutral surfaces with restrained orange accents;
- thin borders, square controls, clear spacing, and no decorative clutter;
- strong information hierarchy without oversized promotional elements;
- existing dark and light UI themes.

Keep interface copy short and functional. External links opened in a new tab must use `target="_blank"` and `rel="noreferrer"`. Add an accessible name when the visible label does not fully identify the destination.

The Ko-fi action uses `https://ko-fi.com/hancore`. Keep it directly before **Browse themes** in the desktop header. It is a desktop utility action and does not belong in mobile bottom navigation unless requested.

## Responsive behavior

The header has three intentional states:

- `0–760 px`: hide desktop navigation links and use mobile bottom navigation;
- `761–879 px`: keep desktop navigation on one line and hide the `THEME MARKETPLACE` suffix;
- `880 px` and wider: show the full brand and desktop navigation.

Do not let navigation labels wrap. Keep arrows attached to labels. For header or layout changes, render at `320`, `375`, `760`, `761`, `800`, `850`, `879`, `880`, `1024`, and `1440` px.

Check:

- no horizontal page scroll;
- no overlap, clipping, or unexpected two-line controls;
- no isolated arrows or detached icons;
- stable header and mobile-navigation heights;
- visible hover and keyboard-focus states;
- usable dark and light themes;
- motion respects `prefers-reduced-motion`.

Run `npm run dev` for runtime review at `http://127.0.0.1:4173`. Stop the server after review unless the maintainer asks to keep it running.

## Accessibility and interaction

Use semantic HTML and native controls. Preserve the skip link, landmarks, headings, visible focus indicators, keyboard navigation, accessible names, live status messages, and reduced-motion behavior.

Do not encode meaning through color alone. Decorative icons and dots need `aria-hidden="true"`. Dynamic controls must expose their current state. Copy actions must keep visible and screen-reader-readable feedback.

Verify hover, focus, active, empty, loading, error, and disabled states when affected.

## Asset cache busting

Static assets use `?v=YYYYMMDD-NN`. Bump the version after the final asset change, not after every edit.

When shared CSS changes, update every HTML reference to `style.css`. When JavaScript changes, update every HTML or module import referencing that file. Keep one version for coupled changes.

Find versions with:

```bash
rg -n '\?v=' site/*.html site/assets/js/*.js
```

Do not leave different versions for the same asset across pages.

## Catalog and source safety

Treat registry, catalog, repository, palette, README, license, and asset values as untrusted input.

The static detail gallery materializes at most 24 wallpapers per theme. `backgroundCount` still records every supported root-level background, and the interface must disclose when a gallery is truncated.

- Escape dynamic HTML with `escapeHtml`.
- Encode URL path segments with `encodeURIComponent`.
- Build query strings with `URLSearchParams`.
- Reject unsupported URL protocols.
- Never render raw upstream HTML.
- Never import, source, spawn, evaluate, or execute community repository content.
- Fetch and inspect source at an exact full commit.
- Keep preview size and pixel limits before decoding.
- Strip image metadata and generate separate card/detail output.
- Make GitHub quota, identity, schema, and ambiguous transport failures fatal.

Catalog inspection is a compatibility check, not a security review. Do not use `Verified`, `safe`, or official-approval language for the current status.

The full catalog build performs live GitHub requests and may update generated files. Run `npm run build` for registry, catalog, source-validation, or generation changes. Do not run it for unrelated UI-only work.

## Theme publication automation

New community submissions use `submit-theme.yml`, exact-snapshot validation, and explicit `approved-theme` publication. Preserve these properties:

- validate one public repository for one theme and require every rights checklist item;
- bind review and initial publication to the freshly inspected repository and exact commit;
- require explicit authorized-maintainer approval;
- reject duplicate active IDs, duplicate repositories, and retired IDs;
- store the approval actor, time, issue, tested Omarchy version, and exact initial commit;
- serialize writes to the canonical registry;
- build and test once;
- deploy the exact tested `site/` artifact without rebuilding;
- fail closed on stale evidence, source changes, identity ambiguity, or validation errors;
- avoid executing submitted theme content.

`theme-submission.mjs` owns the structured issue contract. `theme-github-source.mjs` owns bounded GitHub transport and exact snapshots. `theme-source-validation.mjs` owns static theme compatibility. `approve-theme-submission.mjs` owns the registry projection for approved new sources. Do not duplicate these rules in workflows.

Existing-theme updates use `update-theme.yml`, exact maintainer-supplied commits, the shared native source validator, and selective catalog builds. `update-theme-source.mjs` owns update provenance and history, while `verify-theme-update.mjs` owns the immutable publication projection check. Complete-source delisting uses `delist-themes.yml` and `delist-themes.mjs`; it permanently retires theme IDs and publishes its report only as a workflow artifact. Repository rename or transfer uses `migrate-theme-repository.yml`; it must bind old and new GitHub paths simultaneously to one GraphQL node ID and numeric database ID, preserve the installed theme ID, retain historical evidence under its original repository name, validate exact canonical HEAD, and refresh only the migrated source. `theme-repository-identity.mjs` owns identity and chain validation, while `migrate-theme-repository.mjs` and `verify-theme-migration.mjs` own projection and publication checks. Keep all three operations manual, personal-maintainer-only, and serialized with other catalog writes. Do not stretch the new-listing workflow to perform updates, migrations, or delisting.

Every catalog-writing workflow must package and deploy its exact tested `site/` tree in the same workflow after guarded publication succeeds. Keep Pages permissions in a separate deployment job, serialize it with `github-pages-deployments`, and do not rely on a `GITHUB_TOKEN` push to trigger `deploy-pages.yml`.

Scheduled catalog refreshes must set `PIN_COMMUNITY_CATALOG_SNAPSHOTS=1`. They may refresh built-in Omarchy themes and recheck the exact already-published community commits, but must not advance community repositories to mutable HEAD. Only new-theme approval, guarded update, or guarded migration may publish a different community snapshot.

Opening issues, changing labels, pushing, transferring the repository, changing DNS, or deploying production requires explicit maintainer authority.

## Verification commands

Run for every code or content change:

```bash
npm test
```

Run every whitespace check matching the current state:

- untracked file: `git diff --no-index --check /dev/null path/to/file`;
- uncommitted changes: `git diff --check`;
- staged changes: `git diff --cached --check`;
- unpublished commits: `git diff --check origin/main..HEAD`;
- single commit: `git diff --check HEAD^ HEAD`.

Also run:

- UI or CSS: browser review at the affected viewport matrix;
- registry or catalog: `npm run build`, inspect generated changes, then rerun tests;
- submission workflow: successful and rejected input paths;
- GitHub Actions: least-privilege permissions, pinned actions, timeouts, and concurrency checks.

Structural source tests do not replace runtime browser verification.

## Commits, pushes, and deployment

Do not commit, amend, push, open an issue, or create a pull request without explicit maintainer approval. Approval for one action does not authorize later actions.

Use concise imperative commit subjects. Stage only files belonging to the current step. Do not amend a published commit or force-push `main`.

Before every push:

1. run `git fetch origin main`;
2. inspect status and the local/remote graph;
3. rebase unpublished work onto `origin/main` when histories diverge;
4. preserve remote catalog updates while resolving conflicts;
5. rerun tests and applicable whitespace checks;
6. push normally, never with force;
7. confirm `git rev-list --left-right --count origin/main...main` reports `0 0`.

A push to `main` can be a production deployment. Report the final commit hash and deployment result accurately.

## Definition of done

A change is complete when:

- the requested theme behavior works in relevant states and viewports;
- native Omarchy commands, paths, and terminology are accurate;
- accessibility and visual conventions remain intact;
- asset cache versions match changed files;
- tests and applicable whitespace checks pass;
- generated changes are intentional and reviewed;
- no active product surface depends on copied plugin behavior;
- the worktree contains no unintended files;
- commit, push, and deployment status are reported accurately.

Update this file when a durable architecture, theme contract, workflow, or maintainer decision changes.

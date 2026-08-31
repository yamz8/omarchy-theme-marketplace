# Security Policy

## Report a concern

Report a suspected malicious, compromised, or unsafe marketplace theme through [GitHub private vulnerability reporting](https://github.com/yamz8/omarchy-theme-marketplace/security/advisories/new).

Do not place credentials, exploit details, private data, or other sensitive material in a public issue. Include the listing, repository, relevant commit, observed behavior, and safe reproduction details. If the concern originates upstream, notify the theme maintainer privately when a suitable channel exists.

For copyright, trademark, privacy, or asset-rights concerns, open a [rights or asset removal request](https://github.com/yamz8/omarchy-theme-marketplace/issues/new) without including private information.

## Trust boundary

Omarchy themes are data and visual assets for Omarchy's native theme system; they are not marketplace plugins. A theme can still affect the appearance and usability of terminals, Hyprland, Waybar, notifications, editors, icons, and wallpapers. Images and configuration data are processed by software on the user's machine, so users should review the current repository and its assets before installation.

Marketplace listing is not a security audit, certification, endorsement, warranty, or guarantee. Curation means that the repository matched the documented theme structure at an identified snapshot and was considered appropriate for the catalog.

## Current static inspection

The catalog builder reads public GitHub repositories without executing their contents. For each generated entry it:

1. resolves the repository and branch to an exact full commit SHA;
2. reads the commit tree and root `colors.toml` as data;
3. requires a usable palette with `accent`, `background`, `foreground`, red, yellow, green, cyan, blue, magenta, and a valid dark or light mode;
4. discovers supported images directly under `backgrounds/`;
5. records a root README and license when present;
6. records root files that Omarchy's remote-theme filtering does not install, including symlinks, Lua files, and generated terminal/editor configuration files;
7. bounds preview input to 50 MB and 40 megapixels, strips metadata, and creates separate card and detail WebP files.

The check is deliberately narrow. It does not prove that an image decoder, generated application configuration, repository host, current branch head, or later upstream commit is safe. It does not inspect every possible semantic property of a color palette or asset license.

## Exact snapshot versus installation

The marketplace records `checkedCommit`, `checkedBranch`, and `checkedAt` for each catalog entry. Those fields describe only the source that the catalog builder inspected.

The supported community command is:

```bash
omarchy theme install https://github.com/owner/omarchy-name-theme
```

That command obtains current mutable upstream and does not accept the marketplace's exact checked SHA. A later upstream commit is outside the marketplace snapshot. The UI must never imply that the install command is commit-bound.

Built-in commands select the theme shipped by the user's locally installed Omarchy package. That local package can also differ from the upstream commit used to generate the marketplace entry.

## Optional engagement privacy

The optional credential-free Worker accepts only a catalog `themeId` and one fixed event type: `view`, `copy`, or `heart`. D1 stores daily theme-level aggregates. The application does not store accounts, cookies, browser identifiers, IP addresses, user-agent strings, command text, repository URLs, or theme metadata in D1. Cloudflare may process ordinary request metadata, and the Worker uses the request IP only for ephemeral rate-limit keys.

Browser storage guards repeat views and copies within a session and repeat hearts in one browser, but these controls can be cleared or bypassed. Counts must never be described as unique users, verified votes, downloads, installations, ratings, trust, or security evidence. The current personal production endpoint is enabled only for its reviewed GitHub Pages origin. Disable and re-review engagement before any hostname, endpoint, or ownership change.

## Publication safeguards

New submissions use a structured issue and deterministic static inspection. Validation alone cannot publish. The `approved-theme` label is accepted only from an actor with repository write permission, and the publication job:

1. parses the current structured submission contract;
2. resolves and inspects the current exact theme commit again;
3. rejects active, duplicate, or retired theme IDs and repositories;
4. records the approval actor, time, issue, tested Omarchy version, and exact approved commit in `registry.json`;
5. forces the catalog build to use that exact approved commit for the new source;
6. runs tests and whitespace checks;
7. refuses to publish if `main` changed after the tested build;
8. commits only the registry, generated catalog, Explore data, and normalized theme previews.

The Pages workflow tests and uploads the committed `site/` tree without rebuilding it. Scheduled refreshes are separately serialized, pin community themes to their already-published exact commits, and refuse to publish stale output.

Existing-theme updates, complete-source delisting, and repository rename or transfer are separate manual maintainer workflows. They create and test a checksummed publication transaction in a read-only job, verify its exact registry/catalog/preview projection in another read-only job, and limit the write-token job to applying that immutable transaction from an unchanged `main` base. Delisting permanently retires IDs. Migration requires simultaneous old/new immutable GitHub identity evidence and does not rewrite historical snapshot evidence.

Never represent compatibility validation or maintainer approval as security verification, and never execute submitted theme repository contents in CI.

## Supported versions

Security fixes are applied to the current `main` branch. There are no separately supported release branches yet.

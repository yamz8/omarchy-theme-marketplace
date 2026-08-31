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

## Publication safeguards

Theme-specific automated submission and publication are not implemented yet. Until they are:

- do not enable the copied plugin submission, verification, approval, delisting, or update workflows;
- do not represent a manually added source as security-verified;
- review repository ownership, structure, palette, preview, README, license, and current install behavior before editing `registry.json`;
- run the catalog build and tests before publication;
- review all generated catalog and preview changes;
- never execute a submitted theme repository in CI.

The future automated workflow must bind approval to one exact repository and commit, treat repository values as untrusted input, build a single immutable static artifact, and fail closed when source identity or validation is ambiguous.

## Supported versions

Security fixes are applied to the current `main` branch. There are no separately supported release branches yet.

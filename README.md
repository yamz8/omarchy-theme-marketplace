# Omarchy Theme Marketplace

An independent, static marketplace for discovering themes made for the native [Omarchy](https://github.com/omacom/omarchy) theme system.

The project uses the Omarchy Plugin Marketplace as an implementation and visual reference, but the product, catalog, validation rules, and commands are theme-specific. It does not list plugins or website skins.

The current catalog combines:

- themes shipped in the upstream Omarchy `themes/` directory;
- curated community theme repositories such as [`dhh/omarchy-giants-theme`](https://github.com/dhh/omarchy-giants-theme).

The project currently lives under `yamz8/omarchy-theme-marketplace`. Once the implementation and publication workflow are ready, it can be proposed to the Omarchy maintainers as a companion marketplace alongside the existing plugin directory. This repository does not imply affiliation with or endorsement by Omarchy, 37signals, or the plugin marketplace maintainers.

## How themes work

A community theme is a public Git repository with a root `colors.toml`, one or more images in `backgrounds/`, and optional supported theme assets. Omarchy derives application colors from that palette.

Community themes install from their repository:

```bash
omarchy theme install https://github.com/owner/omarchy-example-theme
```

Built-in themes are already present in Omarchy and are selected by slug:

```bash
omarchy theme set tokyo-night
```

For a repository named `omarchy-example-theme`, Omarchy installs the theme as `example` under `~/.config/omarchy/themes/example`. Built-in themes live under `/usr/share/omarchy/themes`.

See [Develop a theme](site/develop.html) for the repository contract and [Submit a theme](SUBMISSION.md) for the proposed marketplace contract.

## Marketplace behavior

The catalog build reads theme files from an exact Git commit without executing repository code. It validates the palette and repository structure, records source metadata, and normalizes previews into card and detail WebP assets.

Catalog inspection is a compatibility check, not a security review. The normal community install command clones current mutable upstream, which may be newer than the exact commit shown by the marketplace. Review the repository and its current commit before installation.

The site has no application server, accounts, or frontend framework. The generated `site/` directory can be served as static files.

## Local development

Requirements: Node.js 24 or newer and npm.

```bash
npm ci
npm test
npm run dev
```

The local site is available at `http://127.0.0.1:4173`.

Rebuild only the derived Explore data:

```bash
npm run build:explorer
```

Refresh the catalog from GitHub and then rebuild Explore data:

```bash
npm run build
```

The full build performs live GitHub requests and may update generated catalog and preview files when upstream repositories change.

## Submit a theme

Use the [structured theme form](https://github.com/yamz8/omarchy-theme-marketplace/issues/new?template=submit-theme.yml) after testing the public repository on current Omarchy. Validation reads the exact current commit without executing repository contents and posts the theme ID, mode, preview, wallpaper count, license, and commit trace.

Passing validation does not publish a theme. An authorized maintainer must apply `approved-theme`; the guarded publication job then performs a fresh inspection, builds the exact approved commit, runs tests, commits the registry and generated outputs together, and lets the normal Pages workflow deploy the committed static site.

The theme catalog, browse page, detail page, palette explorer, initial-submission workflow, guarded publication, scheduled refresh, and static Pages deployment are implemented. Theme update, repository migration, and delisting workflows remain manual until their separate identity rules are built.

See [PLAN.md](PLAN.md) for the current roadmap, [SECURITY.md](SECURITY.md) for the trust boundary, and [VERIFICATION.md](VERIFICATION.md) for the exact meaning of catalog inspection.

## License and rights

[MIT License](LICENSE) · [Marketplace and third-party rights notice](NOTICE.md)

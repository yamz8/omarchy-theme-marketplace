# Theme Snapshot Inspection

The marketplace performs deterministic compatibility inspection of theme repositories. It does not currently publish a `Verified` security status.

## What `Compatibility passed` means

For a community theme, `Compatibility passed` means the catalog builder successfully inspected one exact Git commit and found:

- a root `colors.toml` that resolves to a supported dark or light palette;
- at least one supported wallpaper directly under `backgrounds/`;
- a usable preview source, either a root preview or the first wallpaper;
- a repository name that produces a valid Omarchy theme slug;
- no structural condition that prevents the standard `omarchy theme install` flow.

For a built-in theme, it means the same core theme structure was found under the configured `themes/` directory of the exact Omarchy source snapshot.

This status is not a security audit, quality score, rights review, endorsement, or promise that current upstream is unchanged.

## Snapshot fields

Each generated theme entry records:

- `checkedCommit`: the exact 40-character commit inspected;
- `checkedBranch`: the branch reported when the snapshot was built;
- `checkedAt`: when the marketplace fetched the source;
- `sourceUrl`: a link to the exact repository tree or built-in theme directory;
- `compatibilityStatus`: the result of the theme-structure inspection.

The detail page exposes this trace so users can compare the catalog snapshot with the repository they intend to install.

## Mutable install boundary

Community installation uses:

```bash
omarchy theme install https://github.com/owner/omarchy-name-theme
```

Current Omarchy theme installation obtains mutable upstream and does not accept an exact marketplace SHA. The checked snapshot and installed commit can therefore differ. Inspect the current repository before running the command.

Built-in selection uses:

```bash
omarchy theme set theme-slug
```

That selects the version shipped by the locally installed Omarchy package, which may differ from the upstream source snapshot displayed by this marketplace.

## Refreshes and updates

`npm run build` resolves every configured source again. If upstream has changed, the generated catalog and preview assets can change with it. Review the exact diff before publication.

The marketplace does not yet have a separate theme-update approval workflow or durable historical verification record. Adding those controls is planned before automated community publication is enabled.

## Display contract

Use these terms consistently:

- `Built in`: shipped in Omarchy and selected with `omarchy theme set`;
- `Community`: installed from an independent repository with `omarchy theme install`;
- `Compatibility passed`: the documented structure passed at the displayed exact snapshot;
- `Catalog snapshot`: the exact source read by the builder;
- `Current upstream`: the mutable source obtained by the normal community install command.

Do not use `Verified`, `safe`, `approved by Omarchy`, or equivalent claims unless a future documented system establishes that exact meaning.

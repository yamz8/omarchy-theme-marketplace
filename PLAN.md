# Omarchy Theme Marketplace Plan

## Product direction

Build a community marketplace for the native Omarchy theme system with the implementation quality and restrained visual language of the existing Omarchy Plugin Marketplace.

This is a replacement product, not a second catalog inside a plugin site. Every active route, command, record, validation rule, and workflow must be about themes.

The project starts under `yamz8/omarchy-theme-marketplace`. After the implementation, safeguards, and deployment are proven, prepare a maintainer proposal for hosting or integration alongside `plugins.omarchy.org`. The Omarchy maintainers decide the final organization, domain, and relationship; this repository must not claim them in advance.

## Product principles

- Follow the real Omarchy theme repository and command contracts.
- Keep source, exact snapshot, license, and mutable-install boundaries visible.
- Prefer static HTML, CSS, JavaScript, and generated JSON.
- Use built-in themes as first-party references and community repositories as curated additions.
- Keep listing distinct from security review or endorsement.
- Treat all upstream repository data and images as untrusted input.
- Do not execute community theme contents in catalog or publication CI.

## Implemented foundation

### Theme catalog

- The registry has a theme-only schema with built-in and community sources.
- Built-in themes are discovered from `omacom/omarchy` under the configured `themes/` root.
- Community themes resolve from public GitHub repositories.
- The builder records an exact commit, branch, fetch time, palette, mode, source, wallpaper count, preview source, license, and filtered root files.
- Preview images are bounded, metadata-stripped, and normalized into card and detail WebP assets.
- Giants is the initial community reference source.

### Marketplace UI

- Browse supports theme search, source, mode, wallpaper-count filters, deterministic sorting, and copy feedback.
- Cards expose palette, source, mode, wallpaper count, and native Set or Install commands.
- Detail pages expose the full palette, previews, installed path, exact source trace, install boundary, and related palettes.
- Explore provides a palette atlas and registry-growth view.
- Dark/light UI themes, accessible controls, and the required responsive header states are implemented.

### Documentation and trust

- Development and publication guidance use the native theme layout.
- Compatibility inspection is explicitly separated from security verification.
- Community install is described as mutable current upstream, not the exact checked snapshot.
- Built-in selection is described as the version in the locally installed Omarchy package.

### Initial submission and deployment automation

- A structured issue form accepts one public GitHub repository for one theme.
- Validation parses fixed fields and rights confirmations, resolves one exact commit, and checks the native theme structure without executing repository contents.
- Sticky issue feedback exposes the derived theme ID, commit, palette mode, preview dimensions, wallpaper count, license, and install boundary.
- `approved-theme` requires a write-authorized maintainer and triggers a fresh exact-snapshot inspection.
- Publication rejects duplicate and retired IDs, records approval evidence, builds the approved commit, tests it, and refuses stale pushes.
- Scheduled refresh and Pages deployment are theme-specific, serialized, and deploy committed tested output without rebuilding.

### Optional anonymous engagement

- The browser and Worker contracts use catalog theme IDs and the fixed `view`, `copy`, and `heart` event types.
- Counts are anonymous aggregate marketplace activity, never installs, downloads, unique people, ratings, trust, or security signals.
- Local and Worker-side rate limits are best-effort abuse controls; no identity or general analytics are introduced.
- Production engagement stays disabled until a reviewed HTTPS endpoint and exact allowed origins are configured. No production hostname is assumed.

### Release hygiene

- Inactive plugin-marketplace screenshots and README graphics have been removed.
- Tests require every local HTML asset reference to resolve and every generated theme preview to be referenced by the catalog, with no orphan preview files.
- The release audit covers a reproducible dependency install, live catalog build, tests, whitespace, generated-output review, and the responsive browser matrix.

### Targeted catalog maintenance

- Exact approval builds refresh only the selected community repository and preserve unrelated catalog records and preview bytes.
- Existing-theme updates validate a maintainer-supplied exact commit, archive the previous catalog snapshot, rebuild only that source, and independently verify that unrelated records and preview bytes remain unchanged.
- Maintainer-only delisting removes one complete community source, permanently retires its installed theme ID, and removes only previews exclusive to that theme.
- Delisting is a static, replayable registry/catalog projection with a checksummed machine-readable report; the report remains an immutable workflow artifact rather than a tracked site file.
- Read-only jobs create, test, and independently replay the delisting transaction before a narrowly scoped write-token job can publish it from an unchanged `main` base.
- Repository migrations require old and new paths to resolve simultaneously to one immutable GitHub node/database identity, preserve the installed theme ID and historical evidence, validate canonical HEAD, and rebuild only the migrated source.
- Scheduled refreshes update built-in themes while pinning every community source to its already-published exact commit, so mutable upstream cannot bypass guarded updates.

## Next implementation goals

### Production review and maintainer proposal

Before approaching the Omarchy maintainers:

- verify a clean `npm ci`, build, tests, and static Pages deployment;
- test submission success and rejection paths;
- document the exact trust and mutable-install boundaries;
- demonstrate responsive behavior across the required width matrix;
- provide a concise architecture and maintenance handoff;
- propose placement alongside `plugins.omarchy.org` without assuming a particular hostname or organization transfer.

Opening the proposal, transferring the repository, changing DNS, or pushing a production deployment requires separate maintainer approval.

## Deferred ideas

- richer wallpaper browsing;
- color-distance search and palette comparisons;
- compatibility history across Omarchy versions;
- theme collections or editor-curated sets;
- exact-SHA theme installation if Omarchy later exposes a supported command.

Do not add accounts, comments, scored ratings, a general analytics system, a frontend framework, or application backend without an explicit architectural decision.

## Completion criteria

The first release is ready when:

- all active product surfaces are theme-only;
- built-in and community commands work as documented;
- source inspection and publication are deterministic and tested;
- copied automation cannot publish plugin-shaped data;
- optional engagement contains no copied plugin IDs, schema, origins, or endpoint assumptions;
- generated files contain only intentional theme catalog changes;
- accessibility, responsive, light, and dark checks pass;
- no credentials, temporary audit data, or local screenshots are committed;
- the repository is ready for a separate maintainer review and hosting proposal.

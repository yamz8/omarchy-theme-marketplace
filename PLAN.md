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
- Built-in themes are discovered from `basecamp/omarchy` under the configured `themes/` root.
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

## Next implementation goals

### Goal 1 — Theme submission automation

Replace copied issue forms and workflows with a narrow theme pipeline:

1. accept one public GitHub repository root URL;
2. normalize and validate its theme slug;
3. resolve repository identity and exact current commit;
4. statically validate `colors.toml`, backgrounds, preview, README, and license;
5. publish deterministic issue feedback without executing repository content;
6. require explicit authorized-maintainer approval;
7. add only the approved source to the theme registry;
8. build and test once, then deploy that exact static artifact.

The copied plugin automation must remain disabled or be removed before this is enabled.

### Goal 2 — Safe updates and delisting

- Refresh existing sources without allowing unrelated catalog drift in approval jobs.
- Preserve retired theme IDs so identifiers cannot be reused accidentally.
- Provide maintainer-only delisting with a machine-readable report.
- Validate repository rename or transfer identity before changing an active source URL.
- Keep updates, publication, and deployment serialized around the canonical registry.

### Goal 3 — Engagement migration

Decide whether the optional anonymous views, command-copy totals, and hearts help theme discovery. If retained, rename the Worker and schema contract to theme IDs, keep the feature credential-free, and avoid accounts, tracking, ratings, or installation telemetry.

### Goal 4 — Deployment and maintainer proposal

Before approaching the Omarchy maintainers:

- remove every active copied plugin artifact and workflow;
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
- generated files contain only intentional theme catalog changes;
- accessibility, responsive, light, and dark checks pass;
- no credentials, temporary audit data, or local screenshots are committed;
- the repository is ready for a separate maintainer review and hosting proposal.

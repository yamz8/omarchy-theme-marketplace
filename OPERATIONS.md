# Omarchy Theme Marketplace Operations

This is the architecture, maintenance, release, and transfer handoff for the independent marketplace currently hosted at `yamz8/omarchy-theme-marketplace`. It does not imply approval, affiliation, a production hostname, or an organization transfer.

## Architecture

The marketplace is static by default:

```text
registry.json + exact upstream theme snapshots
                    |
                    v
        catalog and preview builders
                    |
                    v
        site/catalog.json + WebP previews
                    |
                    v
             static GitHub Pages site
```

The source of theme behavior is the native Omarchy repository shape, especially root `colors.toml` and images directly under `backgrounds/`. The marketplace adds curated listing copy in `registry.json`; it does not add a theme manifest or execute repository content.

The optional Worker is independent of catalog generation and Pages. It can store only anonymous daily aggregate `view`, successful `copy`, and `heart` counts by current catalog theme ID. The checked-in site has no production endpoint configured.

## Local commands

| Command | Purpose | Network |
| --- | --- | --- |
| `npm ci` | Install the pinned build/test dependency graph | npm registry |
| `npm test` | Run domain, catalog, workflow, site, and documentation checks | No |
| `npm run dev` | Serve `site/` at `http://127.0.0.1:4173` | No |
| `npm run build` | Refresh live source snapshots, previews, catalog, and Explore data | GitHub |
| `npm run build:explorer` | Recompute Explore data from the current registry and catalog | No |

Do not hand-edit `site/catalog.json`, `site/explorer-data.json`, or `site/assets/img/themes/`.

## Catalog publication paths

| Operation | Entry point | Community snapshot behavior |
| --- | --- | --- |
| New listing | Structured issue, `theme-validated`, then `approved-theme` | Publishes the freshly revalidated exact commit |
| Existing update | Manual `update-theme.yml` dispatch | Publishes the exact maintainer-supplied commit and archives the prior catalog snapshot |
| Delisting | Manual `delist-themes.yml` dispatch | Removes complete sources, retires IDs, and removes only exclusive previews |
| Rename or transfer | Manual `migrate-theme-repository.yml` dispatch | Requires old/new immutable identity equality and validates canonical HEAD |
| Scheduled refresh | `refresh-catalog.yml` | Refreshes built-ins and rechecks community themes at their published commits |
| Site deployment | Push to `main` | Tests and deploys the committed `site/` tree without rebuilding it |

All catalog writes share `theme-catalog-writes`. Update, delisting, and migration build and test with read-only repository permissions, verify immutable artifact semantics separately, and give write permission only to the final guarded publication job. A changed `main` base aborts publication.

## Trust boundary

- Catalog inspection checks native structure and compatibility at one exact commit; it is not a security review.
- Community install commands obtain current mutable upstream and are not bound to the catalog commit.
- Built-in commands use the theme packaged in the user's locally installed Omarchy version.
- New submissions require a root README and license. The current Giants reference remains visibly marked when GitHub cannot identify a license.
- Preview decoding is bounded to 50 MB and 40 megapixels, metadata is stripped, and separate card/detail WebP outputs are generated.
- Community repository contents are never imported, sourced, spawned, evaluated, or executed in CI.

## Release checklist

Before the first public production push:

1. Fetch `origin/main`, inspect divergence, and rebase unpublished commits if needed.
2. Run `npm ci` from the final tree.
3. Run a live `npm run build`; inspect all generated source SHAs, metadata, warnings, and preview changes.
4. Run `npm test` and every applicable Git whitespace check.
5. Run the site and review dark/light behavior at `320`, `375`, `760`, `761`, `800`, `850`, `879`, `880`, `1024`, and `1440` px.
6. Exercise accepted and rejected submission fixtures and confirm every third-party action is pinned to a full commit.
7. Confirm the production repository has private vulnerability reporting, required issue labels, GitHub Pages, and least-privilege Actions permissions configured.
8. Keep engagement disabled, or separately deploy the Worker, set exact allowed origins, verify its `workers.dev` endpoint, and only then configure the site meta endpoint.
9. Push normally and verify the resulting Pages artifact, deployment URL, commit identity, and responsive runtime.
10. Only after deployment review, decide whether to submit `MAINTAINER_PROPOSAL.md`.

Local implementation checks do not substitute for the first real GitHub Actions and Pages run.

## Repository transfer checklist

If maintainers accept an organization transfer or different canonical repository:

1. Agree on ownership, governance, support link, repository name, and hostname before changing public claims.
2. Update repository links in the site, README, submission/security documents, issue forms, and Worker origin configuration.
3. Replace the personal `yamz8` actor and `yamz8/omarchy-theme-marketplace` repository gates in update, delisting, and migration workflows; update their structural tests in the same commit.
4. Re-provision labels and confirm private vulnerability reporting, Pages, Actions, and branch settings in the destination repository.
5. Keep engagement disabled until the final Pages origin is known and reviewed.
6. Run the complete release checklist after the transfer. Do not assume GitHub redirects are sufficient evidence for a theme-source migration; marketplace source migrations still require immutable GitHub IDs.

## Operational limitations

- The repository has not been pushed or deployed by this implementation session.
- No production marketplace hostname or engagement endpoint is configured.
- Anonymous hearts are unverified reactions, not votes or ratings.
- Omarchy currently has no supported exact-SHA theme install command, so the catalog cannot make normal installation verification-bound.
- A public maintainer proposal, repository transfer, DNS change, Worker deployment, or production Pages push requires separate authorization.

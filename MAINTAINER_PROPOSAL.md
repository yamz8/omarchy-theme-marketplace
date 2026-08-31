# Maintainer Proposal Draft

**Status: draft only — not submitted**

## Suggested title

Community marketplace for native Omarchy themes

## Draft proposal

I have built an independent, static marketplace for themes that use Omarchy's native theme system. The current repository is [`yamz8/omarchy-theme-marketplace`](https://github.com/yamz8/omarchy-theme-marketplace).

The goal is to give themes the same quality of discovery and maintenance experience that community plugins have, while keeping the implementation theme-specific. It is not a plugin catalog and does not treat website skins as Omarchy themes.

The catalog uses the real Omarchy contracts:

- built-in themes are discovered from Omarchy's `themes/` tree and use `omarchy theme set <slug>`;
- community themes are public repository roots and use `omarchy theme install <repository-url>`;
- installed IDs follow Omarchy's repository-name slug derivation;
- `colors.toml`, wallpapers, preview selection, filtered files, and generated application colors follow the native theme behavior.

The current implementation includes:

- browse, detail, publishing-guide, and palette-explorer pages in the restrained visual language of the plugin marketplace;
- built-in Omarchy themes plus `dhh/omarchy-giants-theme` as the initial community reference;
- exact-commit catalog inspection without executing community repository content;
- bounded, metadata-stripped card and detail previews;
- structured submissions with deterministic compatibility feedback and explicit maintainer approval;
- guarded exact-snapshot updates, permanent complete-source delisting, and immutable-identity repository migration;
- pinned scheduled refreshes that cannot advance a community theme around maintainer review;
- static Pages deployment and an optional, disabled-by-default anonymous engagement service.

The trust boundary is deliberately visible. Catalog listing is not a security review or endorsement. The normal community install command obtains mutable current upstream, not the exact catalog commit, and the interface states that distinction.

I would appreciate maintainer guidance on three questions:

1. Is a dedicated community theme marketplace useful alongside the existing plugin directory?
2. If so, should it remain independently maintained and linked by Omarchy, move under an Omarchy-associated organization, or use another arrangement?
3. After a deployment and review, is placement alongside `plugins.omarchy.org` desirable, and what repository/domain naming would you prefer?

I am not assuming an official hostname, transfer, endorsement, or integration. The repository can remain independent unless maintainers prefer another model. An operations handoff, release checklist, public trust policy, and source-specific maintenance workflows are included for review.

Current repository: <https://github.com/yamz8/omarchy-theme-marketplace>

Production demo: to be added only after an approved deployment and verification.

# Submit an Omarchy Theme

This is the theme repository and marketplace contract. Submit through the structured GitHub issue form after testing the published repository on current Omarchy.

## Repository requirements

Submit one public GitHub repository for one theme. The repository must:

- be installable from its root with `omarchy theme install <repository-url>`;
- use a predictable name such as `omarchy-<name>-theme`;
- contain a root `colors.toml`;
- contain at least one supported image directly under `backgrounds/`;
- contain a root README with installation, screenshots, credits, and known limitations;
- contain a root license file and identify separately licensed or restricted assets;
- avoid symlinks and unsupported executable content as part of the installed theme.

A root `preview.png`, `preview.jpg`, `preview.jpeg`, or `preview.webp` is strongly recommended. When no root preview is present, the marketplace uses the first supported wallpaper. The build limits preview and wallpaper inputs to 50 MB and 40 megapixels each, strips metadata, creates card/detail preview variants, and creates thumbnail/detail wallpaper variants for the theme page. The static detail gallery publishes at most 24 wallpapers and reports when additional supported backgrounds were omitted.

Do not add a marketplace manifest. Theme-owned behavior comes from the native Omarchy repository structure; curated listing copy stays in `registry.json`.

## Installed slug

Omarchy derives the installed slug from the repository name by removing the case-sensitive `omarchy-` prefix and `-theme` suffix, then lowercasing the result.

Examples:

| Repository | Installed slug | Local path |
| --- | --- | --- |
| `omarchy-giants-theme` | `giants` | `~/.config/omarchy/themes/giants` |
| `omarchy-solarized-light-theme` | `solarized-light` | `~/.config/omarchy/themes/solarized-light` |

Choose the repository name carefully. A theme ID is a permanent catalog identifier and cannot be reused after retirement.

## Palette contract

Use the current Omarchy `colors.toml` shape. A minimal marketplace-compatible palette declares:

```toml
mode = "dark"

accent = "#7aa2f7"
background = "#1a1b26"
foreground = "#a9b1d6"

red = "#f7768e"
yellow = "#e0af68"
green = "#9ece6a"
cyan = "#449dab"
blue = "#7aa2f7"
magenta = "#ad8ee6"
```

`mode` must be `dark` or `light`. Use six-digit hexadecimal colors. For a complete result across generated application themes, also define the selection, muted, background variants, foreground variants, orange, brown, and bright ANSI colors used by current built-in Omarchy themes.

## Supported assets

The normal repository can include:

```text
omarchy-example-theme/
├── colors.toml
├── preview.png
├── backgrounds/
│   ├── wallpaper-1.jpg
│   └── wallpaper-2.png
├── icons.theme
├── keyboard.rgb
├── shell.lock.toml
├── README.md
└── LICENSE
```

Remote theme installation filters unsupported root files. Do not rely on root Lua files, symlinks, or pre-generated `alacritty.toml`, `foot.ini`, `ghostty.conf`, `kitty.conf`, or `vscode.json` files. Omarchy derives supported application configuration from `colors.toml`.

## Test before submission

Install the public repository on current Omarchy:

```bash
omarchy theme install https://github.com/your-name/omarchy-example-theme
```

Then verify:

- terminal, Hyprland, Waybar, notifications, launcher, and editor colors;
- readable text, selection, muted states, and focus indicators;
- wallpapers at common display sizes and aspect ratios;
- dark or light mode behavior;
- icon theme behavior when `icons.theme` is present;
- a second clean install using only the published repository.

## Open a proposal

Open the [theme submission form](https://github.com/yamz8/omarchy-theme-marketplace/issues/new?template=submit-theme.yml) with:

```markdown
Title: [Theme]: Theme name

### Repository URL
https://github.com/your-name/omarchy-example-theme

### Theme name
Example

### Author
Your display name

### Description
One short functional description.

### Tags
dark, cool

### Tested Omarchy version
Version used for the clean install.

### Checklist
- [ ] The repository is public and installs with `omarchy theme install`.
- [ ] I tested the published repository on current Omarchy.
- [ ] The repository includes a README and license.
- [ ] I own or have permission to submit the theme and its assets.
- [ ] I understand that catalog listing is not a security review or endorsement.
```

Do not create an issue on someone else's behalf until the repository owner confirms the rights statement and the completed body.

## Review and publication

Validation reads the repository tree, palette, preview, README, and license at the exact current commit without executing repository contents. It posts deterministic compatibility feedback to the issue. Passing validation is necessary but does not publish the theme.

An authorized maintainer reviews the proposal and applies `approved-theme`. Publication then performs a fresh inspection, rejects duplicate or retired IDs, records the approval and exact commit in `registry.json`, generates catalog data and normalized theme image assets from that commit, runs tests, packages the exact tested Pages artifact, and refuses to push if `main` changed after the tested build.

The marketplace snapshot does not pin the normal install command. The install command obtains current mutable upstream, so the detail page exposes both that boundary and the exact commit inspected for the catalog.

After guarded publication succeeds, the same workflow deploys the exact tested static artifact without rebuilding it and closes the proposal only after Pages succeeds.

## Update or remove a listing

Open an issue identifying the theme ID, repository, requested action, and reason. Do not include private vulnerability, identity, or rights evidence in a public issue.

Maintainers use separate manual workflows for catalog maintenance:

- **Update marketplace theme** validates a maintainer-supplied exact commit, records the prior snapshot, rebuilds only that theme, and deploys its tested artifact after publication.
- **Delist marketplace themes** removes complete community sources, permanently retires their installed IDs, emits an immutable machine-readable report, and deploys its tested artifact after publication.
- **Migrate theme repository** accepts a rename or transfer only when the old and new GitHub paths resolve simultaneously to the same immutable node and database IDs and still derive the same installed theme ID, then deploys its tested artifact after publication.

Scheduled refreshes recheck community sources at their already-published commits. They do not advance community listings to mutable upstream HEAD. Rights or urgent safety concerns can result in removal through the guarded delisting workflow.

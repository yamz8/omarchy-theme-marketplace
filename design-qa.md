# Plugin-aligned theme hero copy design QA

## Evidence

- Source visual truth: `/tmp/codex-clipboard-iwFtJo.png`, the supplied Omarchy Plugin Marketplace screenshot at 1890 × 1050 pixels.
- Browser-rendered implementation: `/tmp/theme-hero-plugin-copy-1440-final.png` at a 1440 × 900 CSS-pixel viewport and 1440 × 900 image pixels.
- Mobile implementation: `/tmp/theme-hero-plugin-copy-320-final.png` at a 320 × 900 CSS-pixel viewport and 320 × 900 image pixels.
- Focused source crop: `/tmp/plugin-hero-copy-reference.png`.
- Focused implementation crop: `/tmp/theme-hero-copy-implementation.png`.
- Combined focused comparison: `/tmp/theme-hero-copy-comparison.png`, with each side normalized to 940 × 360 pixels.
- State: homepage hero in dark mode; light mode and the full responsive matrix were also checked.

## Findings

- No remaining P0, P1, or P2 issues.
- The adapted eyebrow, heading, paragraph rhythm, link emphasis, and three actions visibly match the supplied plugin-marketplace hierarchy while accurately describing built-in and community Omarchy themes.
- The theme-specific hero illustration and catalog summary are intentional product differences and remain unchanged.

## Comparison history

- Initial P2: `Develop a theme` caused action-label wrapping between 761 and 850 pixels. The action group now wraps whole controls when necessary, and each control keeps its label and arrow together with `white-space: nowrap`.
- Post-fix evidence: all 20 dark/light responsive states passed without horizontal overflow, clipped hero content, or wrapped action labels.

## Responsive and interaction checks

- Rendered at 320, 375, 760, 761, 800, 850, 879, 880, 1024, and 1440 CSS pixels in dark and light modes.
- No horizontal page overflow, hero overflow, clipped copy, or detached arrows were detected.
- The headline and wallpaper-focused sentence were present in every rendered state.
- Existing hero links and theme-toggle behavior remain functional.
- Browser console warnings and errors: none.

## Fidelity surfaces

- Typography: the source's lowercase monospace display rhythm, compact uppercase eyebrow, and technical action labels are preserved.
- Spacing and layout: the existing theme hero grid and restrained spacing remain intact; only whole action controls may wrap at constrained tablet widths.
- Colors and tokens: existing neutral, orange-accent, dark, and light tokens are unchanged.
- Image quality: no assets were changed; the existing native-theme palette sample remains sharp and undistorted.
- Copy and content: plugin wording is faithfully adapted to native themes—built-in/community discovery, source inspection, wallpaper previews, command copying, and desktop customization.

No focused region beyond the hero copy was needed because the requested change affects only that region and the combined normalized crop keeps all changed text legible.

Final result: passed

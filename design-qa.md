# Theme card design QA

## Evidence

- Source visual truth: `/tmp/codex-clipboard-QPSXxb.png`
- Implementation capture: `/tmp/theme-card-design-qa/implementation-final.png`
- Focused comparison: `/tmp/theme-card-design-qa/card-comparison.png`
- Source viewport: 1890 x 1017 physical pixels; the compared card was normalized to 352 CSS pixels wide.
- Implementation viewport: 1512 x 727 CSS pixels at 1.25 device pixel ratio.
- Component comparison: 352 x 382 pixels per card.
- State: dark catalog, first theme card, credential-free engagement totals loaded from a temporary local stub.

## Interaction checks

- Rendered the catalog at 320, 375, 760, 761, 800, 850, 879, 880, 1024, and 1440 CSS pixels.
- Checked dark and light modes without horizontal page overflow or clipped footer controls.
- Checked keyboard focus for **View source** and the command-copy control.
- Checked that the command tooltip is visible on keyboard focus and that both controls retain accessible names.
- Kept the existing command-copy behavior covered by the site tests; the visual review did not modify the system clipboard.

## Findings and resolution

- P1: Theme card actions formed a dense, right-heavy row and visually competed with tags. Resolved with a balanced two-tier footer.
- P2: The text command action was heavier than the plugin card's compact icon actions. Resolved with an icon-only card control and accessible tooltip.
- P2: Disabling engagement could leave an empty action row. Resolved by rerendering the fallback and placing the command beside the source action.
- P3: Theme cards remain intentionally taller than plugin cards because mode, wallpaper count, palette, and inspected source are native theme information.

## Fidelity surfaces

- Typography: retained the existing marketplace monospace and sans-serif hierarchy.
- Spacing: tightened the footer cadence while preserving theme-specific facts.
- Color: reused existing neutral, orange, focus, and light-mode tokens.
- Assets: retained the generated theme previews, current cropping, and palette strips.
- Copy: retained native `omarchy theme set` and `omarchy theme install` behavior and explicit source access.

Final result: passed

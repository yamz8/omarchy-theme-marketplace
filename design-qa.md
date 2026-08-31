# Wallpaper gallery design QA

## Evidence

- Source visual truth: `/tmp/theme-wallpaper-gallery-reference-normalized.png`, captured from the deployed detail page at commit `34b1fe2a` before the gallery existed.
- Browser-rendered implementation: `/tmp/theme-wallpaper-gallery-implementation-1440.png`.
- Focused gallery evidence: `/tmp/theme-wallpaper-gallery-implementation-focus.png`.
- Mobile evidence: `/tmp/theme-wallpaper-gallery-mobile.png`.
- Combined full-view comparison: `/tmp/theme-wallpaper-gallery-comparison.png`.
- Full-view comparison size: 1440 x 900 CSS pixels per side, normalized to 1440 x 900 image pixels.
- Mobile viewport and capture: 320 x 900 CSS and image pixels.
- State: Catppuccin built-in theme, dark mode, first wallpaper selected; light mode was also checked across the responsive matrix.

## Findings

- No P0 or P1 issues found.
- P2: Raw numeric ordering prefixes initially appeared in wallpaper names, such as `2 waves`. The display-name formatter now removes numeric filename prefixes while retaining deterministic source ordering.
- P2: A normal live rebuild refreshed mutable repository metadata even though source commits were unchanged. The generator now supports a complete committed-snapshot rebuild for asset/schema migrations, and the final catalog contains no unrelated star, activity, commit, or checked-time drift.
- The gallery intentionally extends the page below the existing desktop preview. The full-view comparison confirms that the established shell, typography, preview proportions, metadata, tags, borders, and spacing remain unchanged above it.

## Interaction and responsive checks

- Rendered at 320, 375, 760, 761, 800, 850, 879, 880, 1024, and 1440 CSS pixels in dark and light modes.
- No horizontal page overflow, clipped stage, clipped controls, or wrapped Previous/Next labels were detected.
- Previous/Next controls update the image, accessible position output, filename, and selected thumbnail.
- ArrowLeft and ArrowRight navigate from the main viewer; thumbnail navigation uses a roving tab stop and retains visible keyboard focus.
- The selected thumbnail exposes `aria-pressed="true"`; the position output announces changes through `aria-live`.
- Opening and closing the selected wallpaper lightbox works and preserves descriptive image alternative text.
- Touch/pen horizontal swipe handling is present on the main stage while vertical page scrolling remains available.
- JavaScript scrolling respects `prefers-reduced-motion`.
- Browser console warnings and errors: none.

## Fidelity surfaces

- Typography: existing sans-serif content hierarchy and monospace technical controls are preserved.
- Spacing and layout: the gallery follows the existing detail-section rhythm, square controls, thin borders, and full-width media treatment.
- Colors and tokens: only existing background, panel, line, text, muted, and orange accent tokens are used in dark and light modes.
- Image quality: every wallpaper is generated from the exact inspected snapshot, metadata-stripped, bounded before decoding, and emitted as separate thumbnail and detail WebP assets without stretching.
- Copy and content: wording distinguishes wallpapers from the desktop theme preview and names the exact inspected snapshot boundary.

## Follow-up polish

- P3: A future iteration could add lightbox-level Previous/Next controls; the current page viewer already supports complete keyboard, pointer, and touch navigation before opening the selected image.

Final result: passed

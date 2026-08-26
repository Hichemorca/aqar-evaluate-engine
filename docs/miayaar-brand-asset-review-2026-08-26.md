# MIAYAAR Brand Asset Review — 2026-08-26

The approved brand-board image was used as the source. A dark-mode horizontal wordmark was extracted for the public header, showing the icon, MIAYAAR wordmark, and the subtitle `Valuation Intelligence Engine` on the approved navy background. An icon-only mark was extracted with a transparent background for compact UI placement and favicon generation.

The visual inspection confirmed that the wordmark and icon are legible on the current dark navy interface. The icon extraction preserves the navy geometric mark, white highlights, and green check/graph accent. The generated assets are small, website-suitable PNG files:

| Asset | Dimensions | Intended use |
|---|---:|---|
| `miayaar-horizontal-dark.png` | 640 × 155 | Public header and brand lockup |
| `miayaar-icon.png` | 512 × 512 | Compact header, mobile, and icon-only contexts |
| `favicon.png` | 256 × 256 | Browser favicon |

The source image supplied by the user was not modified in place; the extracted assets are derivative website assets.

The icon asset was refined after inspection: the final `miayaar-icon.png` is tightly cropped to the mark at 173 × 190 pixels, so it renders at an appropriate visual size in the admin header while the separate 256 × 256 favicon keeps a navy background.

Local browser review after integration confirmed that both Accuracy Dashboard and Market Intelligence load the MIAYAAR horizontal lockup, the MIAYAAR page title, the shared navy gradient, and the green brand accent. The Accuracy data-source badge now reads `Verified Snapshot` without the old brand/source label. Existing dashboard cards and analytical data remain visible and structurally unchanged.

A local browser review of Calibration Console and the main valuation page confirmed that the cropped MIAYAAR icon is visible in the admin header, the horizontal lockup is visible in the public header, and both pages use the shared navy gradient. The valuation cards and inputs retain their own surfaces; the branding stylesheet changes only the global background, brand accents, buttons, and brand marks.

A final local review of the main valuation page and Data Export confirmed the MIAYAAR wordmark is loaded from the local branding asset, page titles use MIAYAAR, the consent copy uses MIAYAAR, and the export page downloads are named with the MIAYAAR prefix. The export page retains its data controls and uses the shared background without changing card/content behavior.

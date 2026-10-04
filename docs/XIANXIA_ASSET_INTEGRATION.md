# CHƯƠNG — Xianxia Asset Integration Rules

This document records the rules for the supplied `novel_reader_assets` visual pack.

## Brand spelling

The product name is always:

**CHƯƠNG**

Do not render the previous horizontal raster wordmark in product UI. Its brush lettering can be visually misread as “CHƯỞNG”.

Runtime brand lockups must use:

- the supplied book/emblem artwork
- literal Unicode text `CHƯƠNG`
- the tagline `Mỗi chương, một thế giới.` when space allows

The canonical component is `BrandLockup` in `components/Artwork.tsx`.

## Asset policy

Do not modify, redraw, recolor or generate replacements for the supplied artwork during normal UI work.

The app should compose the existing files around live UI and text.

Current integrated artwork:

- `app-background.jpg`: application backdrop
- `icon.png`: brand emblem
- `library-banner.png`: hero / discovery artwork
- `empty-library.png`: empty-state artwork
- `nav-home.png`
- `nav-discover.png`
- `nav-write.png`
- `nav-library.png`
- `nav-profile.png`
- `lotus.png`: ornamental section artwork
- `button-jade.png`: primary CTA background
- `divider.png`: decorative section/reader divider
- `badge-vip.png`: VIP marker
- `cover-palace.png`
- `cover-bamboo.png`
- `cover-archive.png`

The three supplied covers are **fallback placeholders only**. A real `cover_url` uploaded by an author/admin always wins.

This prevents decorative assets from replacing or falsifying an actual book cover.

## Main surfaces

### Home

- exact `BrandLockup`
- supplied app background
- supplied hero banner
- ornamental section icon/divider
- supplied jade CTA background
- supplied cover placeholders when a real cover is missing

### Discover / Tàng Kinh Các

- supplied cover placeholders
- supplied VIP badge
- parchment/jade palette

### Book detail

- real cover first, supplied placeholder fallback
- supplied VIP badge
- supplied jade main CTA
- parchment background and jade/bronze framing

### Reader

- parchment reading surface
- subtle supplied background artwork underneath light reading themes
- supplied divider between chapter heading and body
- jade/gold reader controls

### Library

- supplied cover placeholders
- supplied jade “Đọc tiếp” button
- supplied banner in “Khám phá thêm thế giới mới”
- supplied empty-state artwork through shared EmptyState

### Wallet / forms / admin / author studio

- supplied app background
- jade CTA artwork
- jade/bronze/parchment palette
- exact text brand where branding is shown

## Palette

- paper: `#F4EBD8`
- paper soft: `#FFF8EA`
- jade: `#173F35`
- jade soft: `#3E6659`
- bronze: `#B98945`
- wine/cinnabar: `#7A2735`
- ink: `#2B2A24`

## Regression rules

Release checks must fail if:

- Home returns to the ambiguous raster logo.
- The Home source contains the typo `CHƯỞNG`.
- Required supplied assets disappear.
- Real book covers are ignored when `cover_url` exists.

The UI may be refined, but these rules should remain stable.

# CHƯƠNG — Xianxia Asset Integration Rules

This document records the rules for the supplied `novel_reader_assets` visual pack.

## Brand spelling

The product name is always:

**CHƯƠNG**

Do not render the previous horizontal raster wordmark in product UI. Its brush lettering can be visually misread as “CHƯỞNG”.

Runtime brand lockups must use the new user-supplied horizontal CHƯƠNG logo. The tagline `Mỗi chương, một thế giới.` may be rendered beneath it when space allows.

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

Demo cover artwork is intentionally not used. A book cover is shown only when an author/admin has uploaded a real `cover_url`. Otherwise the UI shows a neutral “Chưa có bìa” placeholder.

## Main surfaces

### Home

- exact `BrandLockup`
- supplied app background
- supplied hero banner
- ornamental section icon/divider
- supplied jade CTA background
- neutral no-cover placeholder until an author/admin uploads a real cover

### Discover / Tàng Kinh Các

- real uploaded covers only; otherwise a neutral no-cover placeholder
- supplied VIP badge
- parchment/jade palette

### Book detail

- real uploaded cover when available; otherwise a neutral no-cover placeholder
- supplied VIP badge
- supplied jade main CTA
- parchment background and jade/bronze framing

### Reader

- parchment reading surface
- subtle supplied background artwork underneath light reading themes
- supplied divider between chapter heading and body
- jade/gold reader controls

### Library

- real uploaded covers only; otherwise a neutral no-cover placeholder
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
- Demo cover assets are reintroduced into runtime.
- Real book covers are ignored when `cover_url` exists.

The UI may be refined, but these rules should remain stable.

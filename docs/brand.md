# Brand

Source: https://www.gufi.io/ (Webflow), retrieved 2026-11-27 from the live site's HTML and
stylesheet (`gufi-2-0.webflow.shared.*.css`). Owner direction (2026-11-27): **Güfi branding only,
use pink, white and light pink, no black.** Nothing is taken from other brands (e.g. Mosaico).

## Assets (`public/brand/`)

| File | What it is | Source |
| --- | --- | --- |
| `gufi-logo-shopify-plus-white.png` | Full site logo: GÜFI wordmark + Shopify Plus Partner badge, white on transparent (1944×551) | Site header logo, unmodified |
| `gufi-wordmark-white.png` | The GÜFI wordmark alone (1166×496) | Cropped from the file above by bounding box; geometry unchanged |
| `gufi-mark.png` | Pink square with the white "Ü" mark (256×256) | Site apple-touch icon, unmodified (also `src/app/icon.png`) |
| `gufi-favicon-32.png` | Favicon (32×32) | Site favicon, unmodified |

The app shows the wordmark as a CSS mask (`.gufi-wordmark`), so it stays the exact official shape
and takes the brand pink. Please send the original vector logo (SVG/AI) when available: the PNG is
sharp at sidebar sizes but a vector is better for PDFs and proposals.

## Colors

| Token | Value | Status | Use |
| --- | --- | --- | --- |
| `--gufi-pink` | `#ff3f76` | **Official** (`--pink` in the site CSS) | Logo, active navigation, focus ring, AI button |
| `--gufi-white` | `#ffffff` | **Official** | Cards, text on pink |
| `--gufi-plum` | `#913b8b` | **Official** (site link hover) | Link hover |
| `--gufi-pink-25/50/100/200/300` | `#fffafc` `#fff5f8` `#ffe8ef` `#ffd1df` `#f8b4c9` | Derived tints of the pink | Page background, sidebar, hover, borders |
| `--gufi-pink-strong` | `#c8104f` | Derived (deeper pink) | Primary buttons and links: white text needs 4.5:1 and `#ff3f76` only reaches 3.4:1 |
| `--gufi-ink` | `#3d1426` | Derived (deep berry) | Body text instead of black (15.8:1 on white) |
| `--gufi-ink-muted` | `#7d4f60` | Derived | Secondary text (6.7:1 on white) |

The site itself also uses black `#0a0a0a` and charcoal `#191a1a`; per the owner, the app does not.

## Type

The site's CSS sets **Inter Display** (bold headings, `-0.019em` tracking), but doesn't actually
load the font file. Inter (SIL Open Font License) is loaded with `next/font`; headings use its
Display optical size (`opsz 32`).

## Details carried over from the site

- Buttons: 8px radius; the secondary button's pink fill sweeps in on hover (site `.button_bg`,
  `cubic-bezier(.165,.84,.44,1)`), with a slight lift.
- The project-card corner (`8px 8px 80px 0`) → `.gufi-corner` on the sign-in card, avatars and
  empty-state icons.
- Soft pink radial glow behind the sign-in screen (site `.background_gradient`).

## Open questions

- Original vector logo and any brand guidelines (spacing, minimum size).
- Whether Güfi has a licensed display font beyond Inter.
- The site is in Spanish; the app starts in English with Spanish planned (organization `locale`).

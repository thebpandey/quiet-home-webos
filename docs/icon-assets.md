# Dock icon assets

The public dock has eight local icons. It uses no network image URLs.
The five service icons are original neutral letter drawings: S, N, P, H, and Y.
They are not official logos. Each letter uses plain geometry and a uniform
white stroke on a transparent background. No brand artwork was used, traced,
or converted. No font or external reference is used in these five files.

The original generic HDMI, Settings, and All Apps glyphs are unchanged.
All eight icons use the root [MIT license](../LICENSE). Service names and
trademarks remain with their owners. Quiet Home has no affiliation with,
sponsorship by, or approval from the listed services.

## Format and package rules

The service letter SVG uses a 256 x 256 view box and one path. The four
letter PNGs are 256 x 256 RGBA images with transparent backgrounds and smooth
edges. These canvases fit the existing transparent dock without changing its
layout, focus indicators, accessible names, launch targets, or navigation.

The existing eight filenames and formats are retained for the app's local
icon mapping and package allowlist. Do not add files to `app/icons/`.
The app still uses the original system glyphs for HDMI, Settings, and All Apps.
The default input label is `HDMI 2`; edit `app/tiles.json` to match your input.

An owner can supply replacement artwork in their local copy, subject to the
artwork owner's terms. Official logos are not included in this public set.
Keep the existing filename and image format, use a transparent background,
and retain safe local SVG content. Do not use scripts, event handlers,
external references, embedded HTML, or external fonts in an SVG. Run the
repository tests and package checks after a replacement. These instructions
do not grant permission to use a third-party logo.

## File inventory

| Local file | Drawing | Bytes | SHA256 |
| --- | --- | ---: | --- |
| `app/icons/stremio.svg` | S | 281 | `b64beb44853b2e0f5771530bbeb1735976a93f4e81154b8efdad04a948c50416` |
| `app/icons/netflix.png` | N | 1755 | `898070209b5723098fd56b65aca060f6227da99ee78919874e4857efa3bff1d6` |
| `app/icons/prime-video.png` | P | 1366 | `9e77069bb1783ee9705cef326558cff5f0f625042af1f2fbcb29124be136c7ba` |
| `app/icons/hbo-max.png` | H | 1312 | `fd81ced44e07c43cae98c9eef6728d138fe9652b1be931e77b3891a36a32c90b` |
| `app/icons/youtube.png` | Y | 1519 | `99618350b8423396e8e9a182d7b6201ab25fd13bc665ff0a1772da66feb050fb` |
| `app/icons/hdmi.svg` | HDMI glyph | 299 | `c5ae808ec5699f1e1930a4343a56923c81e5f0327c85d3c5e9e23373f6c3d45c` |
| `app/icons/settings.svg` | Settings glyph | 357 | `f60dbf14fbffcb5dc09d6efb6f9719399899ed0ec19feb7c0124cc30af65b250` |
| `app/icons/all-apps.svg` | All Apps glyph | 325 | `2221a9081f9b30be0cd38d4bbfad36199bb7aee89dd8f01c5099d8428622ef46` |

## Validation

The four generated PNGs were decoded from their PNG IDAT streams. Their chunk
CRC values, 256 x 256 RGBA headers, scanlines, and alpha range of 0 through 255
were verified. The letter artwork was visually checked on a dark background.
The service SVG has only `svg` and `path` elements with inline geometry and
stroke attributes. No script, handler, external reference, style, font, or
embedded HTML is present. Each icon is below 256 KB.

The package check retains the exact eight-file inventory and rejects extra,
missing, linked, or unsafe icon paths. Browser dock tests retain the existing
geometry, transparent hit areas, focus, pointer, and remote-control checks.
`.gitattributes` preserves the icon bytes on checkout.

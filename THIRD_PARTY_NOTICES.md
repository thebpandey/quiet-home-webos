# Licenses and asset notices

The root `LICENSE` applies to the original Quiet Home code, documentation,
generic project artwork, and original quote bank. It does not replace the
licenses for third-party fonts, development tools, or other third-party works.

## Cormorant Garamond font

`app/fonts/CormorantGaramond.ttf` is third-party font software.

Copyright 2015 the Cormorant Project Authors
([Cormorant project](https://github.com/CatharsisFonts/Cormorant)).

The font uses the SIL Open Font License, Version 1.1. The complete license and
copyright notice are in [`app/fonts/OFL.txt`](app/fonts/OFL.txt). Keep that file
with the font when you distribute it. The font is not licensed under MIT.

## Original graphics and quotes

The five service icons in `app/icons/` are original neutral letter drawings,
not official service logos. The HDMI, Settings, All Apps, and weather glyphs
are original generic project artwork. The quote bank in `app/quotes.json`
contains original project text. These project works use the root MIT license.
See [`docs/icon-assets.md`](docs/icon-assets.md),
[`docs/weather-icons.md`](docs/weather-icons.md), and
[`docs/quote-bank.md`](docs/quote-bank.md).

The 24 wallpapers in `app/wallpapers/` are images generated for this project
with OpenAI image generation. They are illustrations, not travel photographs.
See [`docs/wallpaper-assets.md`](docs/wallpaper-assets.md) and
[`docs/wallpaper-prompts.json`](docs/wallpaper-prompts.json) for their records.
To the extent the contributors hold rights in these images, they permit use,
modification, and distribution under the root MIT license. This statement does
not claim exclusive rights or guarantee that each generated image has copyright
protection in every jurisdiction.

## Service names and trademarks

LG, webOS, Stremio, Netflix, Prime Video, Amazon, HBO Max, YouTube, and other
product names remain the property of their respective owners. The names and
app IDs identify launch targets. They do not grant trademark rights or imply
affiliation, sponsorship, or approval. Official brand artwork is not included
in the public dock icon set. Any owner-supplied replacement logos remain
subject to their owners' terms.

## Development tools and live data

`@webos-tools/cli` is a development dependency under Apache-2.0. Its transitive
dependencies retain their individual licenses. `package-lock.json` records
dependency versions and available license metadata. Installed dependency
licenses remain in `node_modules/`; these tools are not part of the TV app
asset allowlist.

The optional advanced helper in `tools/home-router/` contains original project
scripts. Its native inputs are not included in this source repository. Preserve
[`tools/home-router/NOTICE`](tools/home-router/NOTICE). A native bundle can include
the LG InputHook wrapper (BSD-3-Clause), inputhookpp (GPL-3.0), and ezinject
(zlib-style license), plus linked dependencies. The bundle script copies the
supplied native license files. The root MIT license does not apply to those
native inputs. Do not distribute a native bundle until its complete source and
license obligations have been checked; the existing private-test record does
not establish redistribution compliance.

Weather and air quality come from Open-Meteo and CAMS Global. Their data and
service terms are separate from the source code license. Weather and air-quality
data use [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit
[Open-Meteo](https://open-meteo.com/) for weather and both Open-Meteo and
[CAMS Global](https://atmosphere.copernicus.eu/) for air quality. The free API
is for noncommercial use and has request limits; check the current
[Open-Meteo terms](https://open-meteo.com/en/terms) for your use. The app displays
source credit. See [`docs/weather-data.md`](docs/weather-data.md) for the
endpoints and attribution rules.

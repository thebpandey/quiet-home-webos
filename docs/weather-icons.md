# Original weather icons

Ten original project glyphs show weather conditions beside the temperature.
They are not provider logos or third-party brand assets. They are supplied for use
and distribution with this project. There are no external asset dependencies.

Every icon uses an 80x80 viewBox and transparent background. Main strokes are 3px;
snowflake strokes are 2.5px. Line caps and joins are rounded. The palette is soft
ivory `#f5f3e9`, warm yellow `#f2cf86`, and cool blue `#c7dced`.
Use the original aspect ratio at the planned display size of about 76px.

The SVGs use only `svg`, `g`, `path`, and `circle` elements. They contain no scripts,
event handlers, fonts, external references, filters, animation, style attributes,
embedded HTML, or full-canvas background shapes.

## File inventory

| File in `app/weather-icons/` | ViewBox | Bytes | SHA256 |
| --- | --- | ---: | --- |
| clear-day.svg | 0 0 80 80 | 319 | `1b09ac0ac1984c8d554992c864317506ca191e6a3cdeef361b0a915c4830ab30` |
| clear-night.svg | 0 0 80 80 | 262 | `b72d06f784caa3faf07909066b209de2cbcf5cc43e4032b4924d5c66c65fc911` |
| cloudy.svg | 0 0 80 80 | 293 | `a6295627b3e412ebc35a9c7ea1c890471064679b76163114d97ee289f2d4c253` |
| fog.svg | 0 0 80 80 | 358 | `f5bb0797fe0ba78630923c2e888c5412ecb4655d664125a0cd9952e552e6a69a` |
| partly-cloudy-day.svg | 0 0 80 80 | 386 | `0ef5d4d9255d8a64036f08a7374f653b63390a624d357ab4147fe8f458036db9` |
| partly-cloudy-night.svg | 0 0 80 80 | 369 | `0299a62b06aaa6939f29f0d681c3aca793027dd2deaaf18ae1b169760bb1f951` |
| rain.svg | 0 0 80 80 | 390 | `56fe37ccc2196be4e3bfb1e279c27b4307cde3b26a66060b35bad67ad97581c6` |
| snow.svg | 0 0 80 80 | 470 | `04f91ca4f2088e33315b60f78270286028b76c67dace9fa10960efa343af71ae` |
| storm.svg | 0 0 80 80 | 391 | `4b12815efe375e551109ccc410d3c91b40238eeed2ae85e7182521d3172432cd` |
| unknown.svg | 0 0 80 80 | 326 | `3be33fb9aaf22070db22b91cc0723beae87063e6745925ebca38a25b1edb4fb6` |

Total size: 3,564 bytes; below the 20 KB budget.

## Validation

All ten files were parsed as SVG XML and checked against a small geometry and
attribute allowlist. Encoding is ASCII-compatible UTF-8 without BOM, with LF lines.
A local headless Chrome render of all ten icons was visually reviewed on a dark
background. The contact sheet is verification output outside the shipped app.

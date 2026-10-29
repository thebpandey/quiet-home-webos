# Original quote bank

`app/quotes.json` contains 300 short original aphorisms written for this launcher.
The bank works offline. It contains no author fields, famous-person attributions,
external links, or borrowed celebrity quotations. These are project-original
texts supplied for use and distribution with this project, not a third-party
quotation collection. No claim of celebrity authorship or approval is made.

## Themes and format

There are 30 entries in each category: Motivation, Inspiration, Leadership,
Strength, Love, Healing, Meditation, Integrity, Loyalty, and Gratitude.

Each JSON object has exactly `id`, `category`, and `text`. IDs are stable ASCII
names such as `motivation-01`. Each category runs from 01 through 30. Text uses
plain ASCII punctuation, with no HTML, control characters, URLs, or emojis.
The short text length helps the centered TV display keep each quote readable.
The display timing, random selection, and layout belong to the runtime.

## Editorial approach

The collection uses concrete, kind language and varied sentence structures.
Healing concerns feelings and loss; it makes no medical promises. Strength
includes rest, limits, and asking for support. Loyalty includes consent,
independence, and safety. Leadership emphasizes fairness and clear communication.
The collection makes no promises about health, wealth, or guaranteed success.

## Validation

The content gate checks exactly 300 entries, ten categories with 30 entries each,
stable unique IDs, and unique text after normalization. It also checks text
length 32 through 150 characters, eight through 20 words, allowed fields, JSON
encoding, the 100 KB size limit, and the absence of markup or remote references.
No external service is used to select or retrieve a quote.

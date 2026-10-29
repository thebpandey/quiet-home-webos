# Privacy and network use

Quiet Home stores the selected weather location and cached weather data in local app storage on each TV. Settings accepts a five-digit US ZIP code. The app sends that ZIP to Open-Meteo geocoding, then sends the resolved coordinates to Open-Meteo weather and air-quality endpoints. These services receive network requests, including the IP address used for the connection. Weather and air quality are modeled data from [Open-Meteo](https://open-meteo.com/) and the [Copernicus Atmosphere Monitoring Service](https://atmosphere.copernicus.eu/), provided under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The free API is for non-commercial use and has rate limits; see [Open-Meteo terms and privacy](https://open-meteo.com/en/terms) for current conditions and request logging. Data may become stale when a request fails. No GPS or API key is needed.

The app loads its wallpapers, quotes, and font locally. App launches and inventory use TV services. The All Apps view may use an available Homebrew Channel service if the normal service denies the request. Browser preview simulates TV actions.

The Developer Mode CLI keeps a device key in local user configuration. Protect the key and do not commit or share it. Do not put passwords, passphrases, pairing tokens, account credentials, TV addresses, or personal device inventories in this repository, chat, logs, or app packages. Enter the Key Server passphrase only in the local interactive terminal. Review changes and generated packages before sharing them.

## Development tools

The pinned official LG webOS CLI 3.2.6 has known advisories in its development dependency tree. At the latest audit, npm reported one critical, four high, and one moderate advisory. These packages are development tools; the packaged app has no npm runtime dependencies. The local preview server is this project's Node.js server, not the CLI's web server.

Use development servers and inspection tools only on trusted or local networks. Do not expose the SDK's serve or inspect tools to the Internet. Review `npm audit` and the vendor's updates for current status. Do not use `npm audit fix --force` or downgrade the vendor CLI as an automatic fix; either action can change the toolchain without proving that it works.

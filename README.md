# Quiet Home

Quiet Home is a local launcher for LG webOS TVs. It opens selected apps and HDMI inputs from a calm home screen. It is an independent project, not an LG product.

The screen includes 24 generated, hand-painted wallpapers that rotate every 15 minutes, with fades and scene effects. It also shows 300 original offline quotes, a Central Time clock, and weather and US air quality for an editable US ZIP code. The dock has eight controls, including Settings and All Apps. The quote font is Cormorant Garamond, with its SIL Open Font License in `app/fonts/OFL.txt`.

Version 0.2.10 has been used on two webOS 22 TVs (55-inch and 65-inch). This is not proof of support for every model, firmware, region, app, or input. See [compatibility and test limits](docs/COMPATIBILITY.md).

## Start on a computer

Install Git, Node.js 24 LTS (latest patch), and npm. Then run:

```sh
git clone https://github.com/thebpandey/quiet-home-webos.git
cd quiet-home-webos
npm ci --ignore-scripts
npm test
npm run check
npm run package
npm run preview
```

Open <http://127.0.0.1:4173>. Stop the preview with Ctrl+C. Preview runs locally and simulates TV actions; it cannot prove TV behavior. `npm run package` creates an IPK in `dist/`.

For TV installation, first read [installation](docs/INSTALL.md). Root is **not** needed for Developer Mode sideloading. Native HOME-button routing and automatic startup are separate, advanced work that requires root and device-specific proof. Do not assume that a TV is rootable.

- [Use Codex with this project](docs/CODEX.md)
- [Privacy and network use](docs/PRIVACY.md)
- [Compatibility and known limits](docs/COMPATIBILITY.md)
- [Experimental HOME router source](docs/ROUTER-PUBLIC.md)
- [Optional NextDNS setup](docs/NEXTDNS.md)
- [Optional TV customization](docs/TV-CUSTOMIZATION.md)

The default `app/tiles.json` is an example, not an inventory of your TV. App availability, IDs and inputs can differ. Read the TV inventory and choose your apps and input before you install or change anything on the TV.

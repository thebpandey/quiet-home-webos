# Install and test

## Build and preview

Use Git, Node.js 24 LTS (latest patch), and npm. From the repository root:

```sh
git clone https://github.com/thebpandey/quiet-home-webos.git
cd quiet-home-webos
npm ci --ignore-scripts
npm test
npm run check
npm run package
npm run preview
```

The project pins LG webOS CLI 3.2.6 as a development dependency. See [known development-tool advisories](PRIVACY.md#development-tools). The install command skips package lifecycle scripts. Preview listens on `127.0.0.1:4173`; open that address on the same computer. Stop it with Ctrl+C. TV launches and inventory are simulated in the browser. The package command checks the app and writes `dist/com.local.quietlauncher_0.2.10_all.ipk`. If you change the version in `app/appinfo.json`, use the resulting file name instead.

## Prepare the TV

1. Record the TV model, firmware version and webOS runtime. Confirm the TV and computer are on the same local network.
2. Inspect the installed app and input inventory for this TV. Decide which apps and HDMI input you want. Availability and IDs vary by device and region. Do not remove apps to make the example configuration fit.
3. Edit `app/tiles.json` for the confirmed IDs. The file contains a title and ordered `tiles`; each tile has a `label`, `appId`, and `kind` (`app` or `input`). Optional `params` is an object. Use no more than 24 unique app IDs. Re-run the checks and package after editing.
4. Follow LG's [Developer Mode guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) to install its Developer Mode app, sign in on the TV, enable Developer Mode, restart when prompted, and enable Key Server. Keep the session active; an expired session can remove Developer Mode apps.
5. In a local terminal, add the TV interactively and retrieve its key:

```sh
npm exec -- ares-setup-device
npm exec -- ares-novacom --device tv --getkey
```

Use `tv` as the device name for the commands below. Enter the address shown by the TV, port `9922`, and user `prisoner` in the setup prompts. Enter the Key Server passphrase only when the local terminal asks for it. Do not put it in a command, chat, repository, or package. The CLI keeps a private key in its local user configuration. Protect it. See the [LG CLI guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide).

## Install and verify

After the inventory and configuration checks, run:

```sh
npm run package
npm exec -- ares-install --device tv dist/com.local.quietlauncher_0.2.10_all.ipk
npm exec -- ares-launch --device tv com.local.quietlauncher
```

Test each selected app and input, remote arrows and OK, Settings, All Apps, Back, and focus after returning. Test again after a restart. Record failures for the exact TV and firmware. Some platforms may deny an inventory or launch request. Do not treat preview results as TV results.

To remove only this trial app, if you choose to do so:

```sh
npm exec -- ares-install --device tv --remove com.local.quietlauncher
```

This does not replace LG Home or change native HOME-button routing. For the optional rooted path, see [compatibility](COMPATIBILITY.md). Do not use it as an installation shortcut.

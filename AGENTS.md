# Project instructions

Read README.md and the relevant guide in docs/ before changing this project. Keep changes small and test the affected behavior. Preserve unrelated changes. Run `npm test` and `npm run check` for app changes; run `npm run package` when packaging is affected. A browser preview simulates TV calls and is not proof of TV behavior.

Treat each TV as a separate target. Before any TV write, identify the exact model, firmware and runtime, inspect the installed app and input inventory, and confirm the owner's choices. Do not assume that the example app IDs or HDMI input are correct. Do not remove apps or change system settings without a specific request and an understood recovery path. Stop and report unsupported or unverified operations.

Never ask for or place passwords, passphrases, private keys, pairing tokens, device addresses, or account credentials in chat, source, commits, logs, or packages. Enter Developer Mode credentials and the Key Server passphrase only in the appropriate local interactive prompt. Keep device-specific configuration private.

Developer Mode sideloading and root work are separate. Root, HOME routing, startup hooks, firmware changes, and system modifications require explicit authorization for the specific TV. Check the exact model and firmware with https://cani.rootmy.tv/ and current primary documentation before discussing root. Do not run an exploit, downgrade firmware, or assume a method works. Do not claim native HOME routing or boot behavior without device-specific evidence. The optional `tools/home-router` source has disabled gates and needs its own native build, configuration, and proof; it is not a ready-to-install solution.

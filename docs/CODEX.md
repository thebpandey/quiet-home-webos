# Use Codex

Codex can inspect this project, propose changes, run local checks, and help plan a device test. Follow the [official Codex guide](https://developers.openai.com/codex/) to install and sign in. In a terminal at the repository root, start an interactive session:

```sh
codex
```

Review its proposed actions and results. The installed CLI's `codex --help` gives its current options. Access and supported features depend on your account and installation.

Copy this prompt and adapt it to your task:

```text
Read AGENTS.md, README.md and the relevant docs. Help me prepare Quiet Home for my LG TV.
First identify the exact TV model, firmware version and webOS runtime from information I supply or from safe, read-only checks. Inspect the installed app and input inventory and ask which apps and HDMI input I want before any TV write. Do not assume the example IDs match my TV. Do not remove apps or change settings blindly.
Keep device-specific configuration private. Never ask me to paste passwords, passphrases, private keys, pairing tokens or credentials into chat. Let me enter them only in the appropriate local interactive prompt.
Start with the unrooted Developer Mode path. Root, firmware changes, native HOME routing and autostart are separate opt-in tasks; do not perform them unless I explicitly authorize them for this TV. Do not run exploits or downgrade firmware.
Make the smallest needed local changes, run the relevant tests and package checks, and explain the results. Tell me which steps need a real TV test. Stop and report honestly if an operation is unsupported or cannot be verified.
```

For device setup, use [installation](INSTALL.md). For root eligibility, check the exact model and firmware with [Can I Root My TV?](https://cani.rootmy.tv/) and [webOS Homebrew](https://www.webosbrew.org/rooting/). A webOS SDK or runtime version alone does not establish eligibility.

## Optional TV settings and DNS

For optional work, read [NextDNS](NEXTDNS.md) and [TV customization](TV-CUSTOMIZATION.md). You can add this to the prompt above:

```text
Help me inspect the options supported by my own TV. Keep a private baseline and explain a reversible plan before any DNS, app, privacy, screensaver, voice, or system change. Ask for my choice of each change and keep credentials and profile details in local prompts, not chat. Change only this TV's DNS if I choose NextDNS; preserve its other network settings. Do not remove apps, enable root, run exploits, or change system policies without my separate approval and a verified recovery path. Stop when support or the result cannot be proved.
```

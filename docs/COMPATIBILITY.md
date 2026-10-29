# Compatibility and limits

Version 0.2.10 has been used on a 55-inch and a 65-inch LG TV running webOS 22. Device results are specific to the tested firmware, installed apps, and configuration. The latest Back exit fix was installed on both. On the 65-inch TV, Back passed for all four tested apps. On the 55-inch TV, the final Prime Video Back check is incomplete: the capture was black and showed no exit dialog. Other checks had passed earlier. Do not treat this as proof for other TVs or apps.

The default app and HDMI IDs in `app/tiles.json` are examples from a particular setup. Confirm your own inventory and choices before installation. All Apps and individual launches depend on services and permissions available on the TV. A successful browser preview does not prove they work on a TV.

Developer Mode can sideload the app without root. It does not make this app the native HOME handler or configure startup. Quiet Home does not claim to remove LG services, the screensaver, the microphone, or provide full Alexa integration.

## Optional advanced root work

Native HOME routing and automatic startup require root and separate, device-specific implementation and testing. Before considering root, check the **exact model and firmware** at [Can I Root My TV?](https://cani.rootmy.tv/) and read the current [webOS Homebrew rooting guide](https://www.webosbrew.org/rooting/). A webOS SDK version is not the firmware version and is not proof of eligibility. Disable automatic updates before considering root; updates can change eligibility or root persistence. Rooting or system changes can damage a TV. Do not run an exploit, downgrade firmware, or assume root is available. Decide separately whether to proceed.

The optional [`tools/home-router` source](ROUTER-PUBLIC.md) is for advanced investigation. Its gates and templates are disabled or require device-specific configuration. It needs a suitable native build and proof of behavior and recovery on the actual rooted TV. It is not a ready-to-install universal HOME replacement. Keep LG Home and a recovery path available.

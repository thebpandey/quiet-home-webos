# Optional: customize your TV

These steps are separate from installing Quiet Home. TV features and menus vary by model, firmware, and region. Identify your exact TV and check its current menus and documentation. Record original settings privately and change one item at a time. Test the result and keep a way to undo it.

## Home, privacy, and apps

Use supported LG menus first. Look for Home promotion or content recommendation controls, viewing-information or content-recognition (ACR) choices, user agreements, and voice controls that actually exist on your TV. Read each option before changing it; some choices can affect features you use. LG documents [Home recommendation settings](https://www.lg.com/us/support/help-library/lg-tv-advertising-messages-or-images-appear-when-i-m-watching-tv-CT10000018-20154860356295) and [app management](https://www.lg.com/us/support/help-library/how-to-install-delete-apps-on-your-lg-tv--20155331395481), but the paths can differ on your model.

Inventory installed apps and ask the owner which ones to keep. Use LG's app manager only for apps it marks removable and the owner has chosen to remove. Confirm that a needed app can be restored first. Keep Settings, LG Home, networking, the app manager, and any Homebrew Channel or root access used for recovery. The current HBO Max ID `com.wbd.stream` is distinct from the legacy `com.hbo.hbomax`; verify your own installed version before changing either. Do not apply a fixed deletion list from another TV.

System-app blocking is advanced, device-specific root work. Before considering a policy change, discover the actual policy and app IDs, record a baseline, make a private backup, and establish a recovery path. A change needs explicit owner approval, readback, and a controlled launch-denial test on the target TV. Hiding a front end does not prove its background service stopped. Do not delete firmware files, restart shared application services, or mask the shared `ls-hubd.service` unit as a general cleanup step.

## Screensaver and panel care

Inspect the settings and capabilities of your model before changing a screensaver. Preserve the panel-care features recommended for the display, especially for OLED screens. Do not assume that disabling a screen saver is safe or that one setting controls every saver. `general.screenSaverEnabled` was observed on a webOS 22 setup; it is not a universal setting or proof that all savers stop. Any supported or rooted change needs the owner's separate choice, a recorded original value, and a recovery test. [webOS Homebrew](https://www.webosbrew.org/rooting/) describes the distinction between Developer Mode and rooted customization.

## Microphones and voice

Inspect the actual TV and remote hardware and the manufacturer's instructions. If a physical microphone switch exists, use it according to the manual. Review supported voice settings and agreements separately. A software setting such as `voiceLongDistance` set to off does not prove that a microphone is physically disconnected, and a remote can have its own microphone. Do not claim hardware removal or absence without physical evidence.

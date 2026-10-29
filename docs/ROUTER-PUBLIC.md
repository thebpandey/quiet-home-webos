# Experimental HOME router

`tools/home-router` is source for an advanced, optional experiment on a rooted TV. It targets specific webOS 22 ARM32 devices. It is not a general installer, an automatic root tool, or proof that HOME remapping or startup will work on another TV. Developer Mode installation of Quiet Home does not need it.

The source targets the `lginput2` and `micomservice` processes and uses native injection. It can change a key mapping and launch behavior. A mistake can make the remote or startup difficult to use. Keep LG Home and a verified recovery path available. Obtain explicit authorization for the specific TV before any system change.

## Configuration and evidence

The supplied `gates.json` has its action gates disabled and does not contain a complete configuration. The literal profile names `first-tv-65` and `second-tv-55` are local reference aliases accepted by the source. They do not detect a model or prove compatibility. Do not turn on a gate because a TV has a similar screen size or webOS version.

For each target, first verify the exact model and firmware, ARM ABI, native process paths and behavior, installed apps, inputs, and service support. Establish device-specific evidence for HOME, Settings, and Back, including failure and recovery behavior. Startup and resume need their own proof. The gate values represent manual evidence; they do not create it. Review `core.cjs`, `monitor.cjs`, `router.cjs`, `gates.json`, and their tests before planning a change. Stop if the required behavior or recovery cannot be verified.

## Native files and packaging

Native binaries are not included in this public source. `bundle.cjs` only copies local files and checks pinned hashes; it does not build or verify their source provenance, connect to a TV, or run them. It expects the exact pinned native files and their license files in a local source tree, and writes only to a new directory under `.lanes`. See `tools/home-router/NOTICE` and the bundler source for the required inputs. The native binary provenance and redistribution audit is incomplete. Do not redistribute those binaries from this project.

Root eligibility depends on the exact firmware and model. Consult [compatibility](COMPATIBILITY.md) and current primary sources before considering root. Do not run an exploit or downgrade firmware as part of this guide.

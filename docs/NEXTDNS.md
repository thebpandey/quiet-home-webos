# Optional: NextDNS on one TV

NextDNS can filter DNS queries from your TV. This is optional and separate from Quiet Home. Create or use **your own** [NextDNS account and profile](https://my.nextdns.io/); use the setup details shown in that profile. A DNS filter cannot guarantee that all advertising or telemetry stops, and it can break apps.

## Prepare and change only TV DNS

1. Record the TV model and firmware. Find the network settings and the manual DNS option for the active Wi-Fi or wired connection. Menu names vary; see [LG's network guidance](https://www.lg.com/us/support/help-library/lg-tv-how-to-manually-change-the-dns-server-settings--20150576570174).
2. Make a private backup of the current DNS mode and values, IP address, subnet mask, gateway, and DHCP settings. Keep addresses and account details out of chat, logs, and public files. Know how to restore the original DNS before you continue.
3. In your NextDNS profile, read the setup instructions for unencrypted IPv4 DNS and link the public IP if that method requires it. A changing public IP can need relinking. [NextDNS says linked IPv4 does not work with carrier-grade NAT or multi-IP setups](https://help.nextdns.io/t/m1hmv0k/which-setup-type-to-use). If either applies, or the profile cannot be identified reliably, stop and restore the original DNS.
4. Change **only** the TV's DNS setting to the endpoint shown in your profile. Preserve the existing IP, mask, gateway, and DHCP configuration. If the TV cannot change DNS independently, stop rather than guess at the other fields or change the router.

Some configurations use profile-specific IPv6 addresses. Use that path only if your TV natively supports entering IPv6 DNS and the existing network has working IPv6 connectivity. Do not enable IPv6 just for this guide. Manual DNS does not establish encrypted DNS. A rooted DNS-over-HTTPS proxy is not bundled with this project.

## Choose and check filters

In your own profile, consider a current Smart TV list from NextDNS's Privacy catalog. Check the list description and maintenance status first; availability can change. Start with one list and conservative settings. Test normal TV functions, each streaming app, playback, sign-in, and any RealDebrid-dependent workflow you use. If a function fails, review the affected query in your own account and adjust only the relevant rule or restore the prior setting. Do not add broad allow or deny rules without evidence.

From the TV browser, open [test.nextdns.io](https://test.nextdns.io/) and check the status and profile against your own setup. Use the TV's normal resolver; a browser or network with separate DNS settings can give a misleading result. Enable or inspect live query logs in your account as needed, then trigger a known TV request as a canary and check that it appears in the intended profile. A status page alone does not prove that every app uses the same resolver. Check again after a day, including streaming and the linked-IP status. Query logging has privacy and retention effects; review [NextDNS settings and privacy](https://nextdns.io/privacy) before enabling it. Do not export query logs, profile IDs, keys, or addresses.

If resolution or an app fails, restore the saved **TV DNS setting** and test again. Do not reset Wi-Fi, change the router for all devices, or guess at network values. See [NextDNS's blocklist catalog](https://github.com/nextdns/blocklists) for available list sources.

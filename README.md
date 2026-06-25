# Fortochka

Lightweight bypass router for OpenWrt.
Engine is **Xray** (XHTTP / Vision / REALITY post-quantum); all routing and DNS
live in the system (nft + dnsmasq + dnsproxy) — the engine is just a dumb outbound.

## Features
- Modes: **all** (route everything) / **domains** (lists only) / **off**.
- Outbound three ways: **raw JSON** · **share link** (vless/trojan/ss/vmess, with
  XHTTP `extra` and REALITY post-quantum `pqv`) · **subscription** (base64/list,
  pick server by number or name, auto-update — first fetch direct, then via VPN).
- Domain and CIDR lists kept separate: manual files + remote URLs (cron auto-update).
- **Per-device routing** — force a device fully through the VPN or always direct (IP/MAC).
- Exclusions (destinations always direct).
- Clean DNS for blocked domains: dnsproxy (DoH/DoT/UDP) + bootstrap + TTL, so the
  ISP can't spoof their IPs. Built-in presets (Cloudflare/Google/Yandex/Quad9/AdGuard).
- **Watchdog** — probes the tunnel and auto-restarts Xray if it dies.
- **Self-update** from GitHub (`fortochka upgrade` / Update button).
- QUIC blocking, NTP bypass, log level, list download via VPN.
- LuCI panel: live **exit IP + country**, **↑↓ speed**, built-in **speedtest**, logs.

## Install
One-liner (on the router):
```
sh -c "$(curl -sSL https://raw.githubusercontent.com/pwnnex/fortochka/main/install.sh)"
```
Or from a clone:
```
git clone https://github.com/pwnnex/fortochka && cd fortochka && sh install.sh
```
Then: **LuCI → Services → Fortochka** → set your server (Outbound) → Save & Apply.

The installer pulls deps: `xray-core kmod-nft-tproxy dnsmasq-full dnsproxy curl
coreutils-base64 luci-base`. Needs ~25 MB free in /overlay.

## Uninstall
```
sh -c "$(curl -sSL https://raw.githubusercontent.com/pwnnex/fortochka/main/uninstall.sh)"
```
Removes files, config, service, cron and the nft table, and restores dnsmasq.
Dependency packages are left installed.

## CLI
```
fortochka status | apply | down | speedtest
fortochka update-lists      # fetch remote lists
fortochka sub-update        # refresh subscription
fortochka upgrade           # self-update from github
fortochka logs
```
Xray and dnsproxy are supervised by procd (`/etc/init.d/fortochka`).

## How it works
```
dnsmasq: blocked domains -> dnsproxy(DoH) [clean IP] -> nftset vpn4/vpn6
nft (prerouting, mangle): daddr @vpn4 -> TPROXY :1234 + fwmark, @direct -> bypass
ip rule fwmark -> table 100 -> lo  ->  Xray dokodemo :1234 -> outbound (mark 255)
```
Anti-loop: Xray's own outbound packets are marked `255` and returned early by nft.

## Layout
```
etc/config/fortochka                 uci config (main / outbound / dns / lists)
usr/bin/fortochka                    all logic
etc/init.d/fortochka                 procd service (xray + dnsproxy)
etc/fortochka/*.lst                  domains / subnets / url_* / exclude / dev_*
usr/share/luci, usr/share/rpcd       luci menu + acl
www/luci-static/resources/view/…     panel
```

## License
GPL-3.0 — see [LICENSE](LICENSE).

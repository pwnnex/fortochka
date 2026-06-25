#!/bin/sh
# fortochka uninstaller for OpenWrt.
# one-liner: sh -c "$(curl -sSL https://raw.githubusercontent.com/pwnnex/fortochka/main/uninstall.sh)"

echo "[*] stopping service..."
/usr/bin/fortochka down 2>/dev/null      # tear down nft table, ip rules, dnsmasq conf
/etc/init.d/fortochka stop 2>/dev/null
/etc/init.d/fortochka disable 2>/dev/null

echo "[*] nftables + policy routing..."
nft delete table inet fortochka 2>/dev/null
ip rule del fwmark 1 table 100 pref 100 2>/dev/null
ip route flush table 100 2>/dev/null
ip -6 rule del fwmark 1 table 100 pref 100 2>/dev/null
ip -6 route flush table 100 2>/dev/null

echo "[*] cron..."
sed -i '\#/usr/bin/fortochka #d' /etc/crontabs/root 2>/dev/null
/etc/init.d/cron restart >/dev/null 2>&1

echo "[*] restoring dnsmasq..."
uci -q delete dhcp.@dnsmasq[0].confdir
uci commit dhcp 2>/dev/null
rm -f /tmp/dnsmasq.d/fortochka.conf
/etc/init.d/dnsmasq restart >/dev/null 2>&1

echo "[*] removing files..."
rm -f  /usr/bin/fortochka /etc/init.d/fortochka /etc/config/fortochka
rm -rf /etc/fortochka
rm -f  /etc/xray/config.json
rm -f  /usr/share/luci/menu.d/luci-app-fortochka.json
rm -f  /usr/share/rpcd/acl.d/luci-app-fortochka.json
rm -rf /www/luci-static/resources/view/fortochka
rm -f  /tmp/fortochka.* /var/lock/fortochka.lock

echo "[*] luci cache + rpcd/uhttpd..."
rm -f /tmp/luci-indexcache* 2>/dev/null
rm -rf /tmp/luci-modulecache 2>/dev/null
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd restart >/dev/null 2>&1

echo
echo "Done. Fortochka removed."
echo "Packages were left installed. Remove them manually if you don't need them:"
echo "  apk del xray-core dnsproxy        # (opkg remove ... on older builds)"
echo "  dnsmasq-full / kmod-nft-tproxy / curl are usually wanted — keep."
echo "Note: stock dnsproxy service was disabled at install; re-enable if you used it:"
echo "  /etc/init.d/dnsproxy enable && /etc/init.d/dnsproxy start"

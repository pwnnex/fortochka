#!/bin/sh
# fortochka installer for OpenWrt.
# from a checkout:   sh install.sh
# one-liner:         sh -c "$(curl -sSL https://raw.githubusercontent.com/pwnnex/fortochka/main/install.sh)"
set -e

TARBALL="https://github.com/pwnnex/fortochka/archive/refs/heads/main.tar.gz"

# if not run from the source tree, pull it from github
if [ ! -f usr/bin/fortochka ]; then
	echo "[*] fetching fortochka from github..."
	command -v curl >/dev/null 2>&1 || { opkg update >/dev/null 2>&1 || apk update >/dev/null 2>&1; (apk add curl || opkg install curl) >/dev/null 2>&1 || true; }
	d=/tmp/fortochka-src; rm -rf "$d"; mkdir -p "$d"
	curl -fsSL "$TARBALL" | tar -xz -C "$d" --strip-components=1 || { echo "download failed"; exit 1; }
	cd "$d"
fi

echo "[1/6] dependencies..."
DEPS="xray-core kmod-nft-tproxy dnsmasq-full luci-base dnsproxy curl coreutils-base64"
if command -v apk >/dev/null 2>&1; then
	apk update 2>/dev/null || true
	apk add $DEPS 2>/dev/null || echo "  ! install manually: $DEPS (replace plain dnsmasq)"
else
	opkg update 2>/dev/null || true
	opkg install kmod-nft-tproxy dnsmasq-full luci-base dnsproxy curl coreutils 2>/dev/null || true
	echo "  ! xray-core: if missing in the feed, drop the Xray binary into /usr/bin/xray"
fi
# disable the stock dnsproxy service — fortochka runs its own on :5353
/etc/init.d/dnsproxy disable 2>/dev/null || true; /etc/init.d/dnsproxy stop 2>/dev/null || true

echo "[2/6] strip CRLF..."
sed -i 's/\r$//' usr/bin/fortochka etc/init.d/fortochka 2>/dev/null || true

echo "[3/6] core/CLI..."
mkdir -p /etc/fortochka /etc/xray
cp usr/bin/fortochka    /usr/bin/fortochka
cp etc/init.d/fortochka /etc/init.d/fortochka
chmod +x /usr/bin/fortochka /etc/init.d/fortochka
[ -f /etc/config/fortochka ] || cp etc/config/fortochka /etc/config/fortochka
for f in etc/fortochka/*.lst; do
	b=$(basename "$f")
	[ -f "/etc/fortochka/$b" ] || cp "$f" "/etc/fortochka/$b"
done

echo "[4/6] LuCI app..."
mkdir -p /usr/share/luci/menu.d /usr/share/rpcd/acl.d /www/luci-static/resources/view/fortochka
cp usr/share/luci/menu.d/luci-app-fortochka.json /usr/share/luci/menu.d/
cp usr/share/rpcd/acl.d/luci-app-fortochka.json  /usr/share/rpcd/acl.d/
cp www/luci-static/resources/view/fortochka/settings.js /www/luci-static/resources/view/fortochka/

echo "[5/6] reset LuCI cache + restart rpcd/uhttpd..."
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -rf /tmp/luci-modulecache 2>/dev/null || true
/etc/init.d/rpcd restart 2>/dev/null || true
/etc/init.d/uhttpd restart 2>/dev/null || true

echo "[6/6] enable service..."
/etc/init.d/fortochka enable

echo
echo "Done. Next:"
echo "  1) LuCI -> Services -> Fortochka  (Ctrl+F5; or edit /etc/config/fortochka)"
echo "  2) Outbound: raw JSON / link (vless://…) / subscription"
echo "  3) hit Save & Apply  (or: /etc/init.d/fortochka start)"
echo "  4) check: fortochka status   |   speed: fortochka speedtest"

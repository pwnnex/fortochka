#!/bin/sh
# Установка Форточки на OpenWrt. Запускать НА РОУТЕРЕ из распакованной папки проекта:
#   sh install.sh
set -e

echo "[1/6] зависимости..."
# xray-core: движок | kmod-nft-tproxy: TPROXY | dnsmasq-full: nftset
# dnsproxy: чистый DNS (DoH/DoT) | curl: socks-загрузка/спидтест | coreutils-base64: декод подписок
DEPS="xray-core kmod-nft-tproxy dnsmasq-full luci-base dnsproxy curl coreutils-base64"
if command -v apk >/dev/null 2>&1; then
	apk update 2>/dev/null || true
	apk add $DEPS 2>/dev/null || echo "  ! поставь вручную: $DEPS (удалив обычный dnsmasq)"
else
	opkg update 2>/dev/null || true
	opkg install kmod-nft-tproxy dnsmasq-full luci-base dnsproxy curl coreutils 2>/dev/null || true
	echo "  ! xray-core: если нет в фиде — скачай Xray-linux-mips32le и положи в /usr/bin/xray"
fi
# штатный сервис dnsproxy выключаем — Форточка поднимает свой на :5353
/etc/init.d/dnsproxy disable 2>/dev/null || true; /etc/init.d/dnsproxy stop 2>/dev/null || true

echo "[2/6] чистка CRLF..."
sed -i 's/\r$//' usr/bin/fortochka etc/init.d/fortochka 2>/dev/null || true

echo "[3/6] ядро/CLI..."
mkdir -p /etc/fortochka /etc/xray
cp usr/bin/fortochka    /usr/bin/fortochka
cp etc/init.d/fortochka /etc/init.d/fortochka
chmod +x /usr/bin/fortochka /etc/init.d/fortochka
[ -f /etc/config/fortochka ] || cp etc/config/fortochka /etc/config/fortochka
for f in etc/fortochka/*.lst; do
	b=$(basename "$f")
	[ -f "/etc/fortochka/$b" ] || cp "$f" "/etc/fortochka/$b"
done

echo "[4/6] LuCI-панель..."
mkdir -p /usr/share/luci/menu.d /usr/share/rpcd/acl.d /www/luci-static/resources/view/fortochka
cp usr/share/luci/menu.d/luci-app-fortochka.json /usr/share/luci/menu.d/
cp usr/share/rpcd/acl.d/luci-app-fortochka.json  /usr/share/rpcd/acl.d/
cp www/luci-static/resources/view/fortochka/settings.js /www/luci-static/resources/view/fortochka/

echo "[5/6] сброс кэша LuCI + перезапуск rpcd/uhttpd..."
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -rf /tmp/luci-modulecache 2>/dev/null || true
/etc/init.d/rpcd restart 2>/dev/null || true
/etc/init.d/uhttpd restart 2>/dev/null || true

echo "[6/6] включение сервиса..."
/etc/init.d/fortochka enable

echo
echo "Готово. Дальше:"
echo "  1) LuCI -> Сервисы -> Форточка  (Ctrl+F5; или правь /etc/config/fortochka)"
echo "  2) Outbound: сырой JSON / ссылка (vless://…) / подписка"
echo "  3) кнопка «Применить» (или: /etc/init.d/fortochka start)"
echo "  4) проверь: fortochka status   |   тест: fortochka speedtest"

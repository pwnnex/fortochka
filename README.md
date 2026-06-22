# Форточка (fortochka)

Лёгкий маршрутизатор обхода для OpenWrt — selective/full routing.
DNS — нативно в системе (nft + dnsmasq + dnsproxy), движок = «тупой» outbound.

## Возможности
- Режимы: **all** (весь трафик в туннель) / **domains** (только списки) / **off**.
- Outbound тремя способами: **сырой JSON** · **ссылка** (vless/trojan/ss/vmess,
  с XHTTP `extra` и REALITY post-quantum `pqv`) · **подписка** (base64/список,
  выбор сервера по номеру/имени).
- Списки доменов и CIDR — раздельно: ручные файлы + remote-URL (автообновление по cron).
- Исключения «всегда напрямую» (устройство/IP мимо туннеля).
- Чистый DNS для заблок-доменов: dnsproxy (DoH/DoT/UDP) + bootstrap + TTL —
  чтобы провайдер не подменял IP.
- Резка QUIC, исключение NTP, уровень логов, скачивание списков через VPN.
- LuCI-панель: состояние, логи, **встроенный спидтест туннеля**, кнопки управления.

## Зависимости
`xray-core` · `kmod-nft-tproxy` · `dnsmasq-full` · `luci-base` · `dnsproxy` ·
`curl` · `coreutils-base64` (install.sh ставит сам).
> ⚠️ нужно ~25 МБ в /overlay. На устройствах с малым flash сначала освободи место.

## Установка
Скопировать папку на роутер и запустить установщик:
```
scp -r fortochka root@192.168.1.1:/tmp/
ssh root@192.168.1.1
cd /tmp/fortochka && sh install.sh
```
Затем: **LuCI → Сервисы → Форточка** → задать сервер (Outbound) → «Применить».
Или править `/etc/config/fortochka` и `fortochka apply`.

## CLI
```
fortochka apply | down | status | speedtest
fortochka update-lists      # скачать списки по URL
fortochka sub-update        # обновить подписку
fortochka logs
```
Xray и dnsproxy супервизит procd (`/etc/init.d/fortochka`).

## Структура
```
etc/config/fortochka                 UCI-конфиг (main / outbound / dns / lists)
usr/bin/fortochka                    вся логика
etc/init.d/fortochka                 procd-сервис (xray + dnsproxy)
etc/fortochka/*.lst                  domains/subnets/url_*/exclude/sub
usr/share/luci/menu.d/…              пункт меню LuCI
usr/share/rpcd/acl.d/…               права
www/luci-static/resources/view/…     панель
```

## Как устроено
```
dnsmasq: заблок-домены -> dnsproxy(DoH) [чистый IP] -> nftset vpn4/vpn6
nft (prerouting, mangle): daddr @vpn4 -> TPROXY :1234 + fwmark, @direct -> мимо
ip rule fwmark -> table 100 -> lo  ->  Xray dokodemo :1234 -> outbound (mark 255)
```
Анти-петля: исходящие пакеты Xray помечены `mark 255` и первым правилом nft уходят мимо.

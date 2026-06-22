'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';
'require poll';

var FILES = {
	domains:     '/etc/fortochka/domains.lst',
	subnets:     '/etc/fortochka/subnets.lst',
	url_domains: '/etc/fortochka/url_domains.lst',
	url_subnets: '/etc/fortochka/url_subnets.lst',
	exclude:     '/etc/fortochka/exclude.lst'
};

function runCmd(bin, args, okMsg) {
	ui.showModal(_('Выполняю…'), [ E('p', { 'class': 'spinning' }, _('Подождите…')) ]);
	return fs.exec(bin, args).then(function(res) {
		ui.hideModal();
		var out = (res && (res.stdout || res.stderr)) || '';
		ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' },
			(okMsg ? okMsg + '\n' : '') + out), 'info');
	}).catch(function(e) {
		ui.hideModal();
		ui.addNotification(null, E('p', _('Ошибка: ') + e), 'error');
	});
}

// стили
var CARD = 'margin:0;padding:12px 14px;background:rgba(127,127,127,.08);' +
	'border:1px solid rgba(127,127,127,.25);border-radius:8px;' +
	'font-size:12px;line-height:1.55;white-space:pre-wrap;overflow:auto';
var BAR  = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px';
var BTN  = 'border-radius:7px;padding:6px 14px;font-weight:500;cursor:pointer';

function cmdBtn(label, cls, bin, args, okMsg) {
	return E('button', {
		'class': 'btn cbi-button ' + cls, 'style': BTN,
		'click': function() { return runCmd(bin, args, okMsg); }
	}, label);
}

// textarea на файл, а не на uci
function fileOption(section, key, title, desc, preload, rows) {
	var o = section.option(form.TextValue, key, title, desc);
	o.rows = rows || 8;
	o.monospace = true;
	o.rmempty = false;
	o.cfgvalue = function() { return preload[key] || ''; };
	o.write = function(sid, val) {
		var data = (val || '').replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
		return fs.write(FILES[key], data);
	};
	o.remove = function() {};
	return o;
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.exec('/usr/bin/fortochka', [ 'status' ]), {}),
			L.resolveDefault(fs.read(FILES.domains), ''),
			L.resolveDefault(fs.read(FILES.subnets), ''),
			L.resolveDefault(fs.read(FILES.url_domains), ''),
			L.resolveDefault(fs.read(FILES.url_subnets), ''),
			L.resolveDefault(fs.exec('/usr/bin/fortochka', [ 'logs' ]), {}),
			L.resolveDefault(fs.read(FILES.exclude), '')
		]);
	},

	render: function(data) {
		var statusOut = (data[0] && data[0].stdout) ? data[0].stdout : _('нет данных');
		var logsOut = (data[5] && data[5].stdout) ? data[5].stdout : _('нет логов');
		var preload = {
			domains:     data[1] || '',
			subnets:     data[2] || '',
			url_domains: data[3] || '',
			url_subnets: data[4] || '',
			exclude:     data[6] || ''
		};
		var m, s, o;

		m = new form.Map('fortochka', _('Форточка'),
			_('Лёгкий маршрутизатор обхода: Xray (outbound-JSON) + nftables (TPROXY) + dnsmasq. ' +
			  'Режим «весь трафик» или «только домены/подсети из списков».'));

		// состояние + кнопки
		s = m.section(form.TypedSection, '_status');
		s.anonymous = true;
		s.cfgsections = function() { return [ '_status' ]; };
		s.render = function() {
			var box = E('pre', { 'id': 'fortochka-status', 'style': CARD }, statusOut);
			poll.add(function() {
				return fs.exec('/usr/bin/fortochka', [ 'status' ]).then(function(r) {
					var el = document.getElementById('fortochka-status');
					if (el) el.textContent = (r && r.stdout) ? r.stdout : _('нет данных');
				});
			}, 10);
			return E('div', { 'class': 'cbi-section' }, [
				E('h3', '🪟 ' + _('Состояние')),
				E('div', { 'class': 'cbi-section-node' }, [
					box,
					E('div', { 'style': BAR }, [
						cmdBtn('🔄 ' + _('Перезапустить'), 'cbi-button-apply',  '/etc/init.d/fortochka', [ 'restart' ], _('Перезапущено')),
						cmdBtn('📥 ' + _('Списки'),        'cbi-button-action', '/usr/bin/fortochka',    [ 'update-lists' ], _('Списки обновлены')),
						cmdBtn('📡 ' + _('Подписка'),      'cbi-button-action', '/usr/bin/fortochka',    [ 'sub-update' ], _('Подписка обновлена')),
						cmdBtn('⚡ ' + _('Спидтест'),      'cbi-button-action', '/usr/bin/fortochka',    [ 'speedtest' ], _('Замер')),
						cmdBtn('⏻ ' + _('Выключить'),      'cbi-button-reset',  '/etc/init.d/fortochka', [ 'stop' ], _('Остановлено'))
					])
				])
			]);
		};

		// логи
		s = m.section(form.TypedSection, '_logs');
		s.anonymous = true;
		s.cfgsections = function() { return [ '_logs' ]; };
		s.render = function() {
			var lbox = E('pre', {
				'id': 'fortochka-logs',
				'style': CARD + ';max-height:340px;font-size:11px'
			}, logsOut);
			return E('div', { 'class': 'cbi-section' }, [
				E('h3', '📋 ' + _('Логи')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'style': 'margin-bottom:8px' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-action', 'style': BTN,
							'click': function() {
								return fs.exec('/usr/bin/fortochka', [ 'logs' ]).then(function(r) {
									var el = document.getElementById('fortochka-logs');
									if (el) el.textContent = (r && r.stdout) ? r.stdout : _('нет логов');
								});
							}
						}, '🔁 ' + _('Обновить логи'))
					]),
					lbox
				])
			]);
		};

		// основное
		s = m.section(form.NamedSection, 'main', 'fortochka', _('Основные настройки'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Включено'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('Режим'),
			_('all — весь трафик в туннель; domains — только домены/подсети из списков'));
		o.value('domains', _('Только списки (domains)'));
		o.value('all', _('Весь трафик (all)'));
		o.value('off', _('Выключено (off)'));

		o = s.option(form.Flag, 'disable_quic', _('Резать QUIC'),
			_('Блокировать UDP/443, чтобы браузеры использовали TCP'));

		o = s.option(form.Flag, 'exclude_ntp', _('Не проксировать NTP'),
			_('Синхронизация времени (UDP/123) пойдёт напрямую'));

		o = s.option(form.ListValue, 'update_interval', _('Автообновление списков'),
			_('Скачивать списки по URL автоматически (cron)'));
		o.value('off', _('Выключено'));
		o.value('hourly', _('Каждый час'));
		o.value('6h', _('Каждые 6 часов'));
		o.value('12h', _('Каждые 12 часов'));
		o.value('daily', _('Раз в день (04:00)'));
		o.value('2days', _('Раз в 2 дня'));
		o.value('weekly', _('Раз в неделю'));

		o = s.option(form.Flag, 'download_via_proxy', _('Скачивать списки через VPN'),
			_('Качать списки по URL через туннель (SOCKS), а не напрямую. Нужен запущенный xray.'));

		o = s.option(form.ListValue, 'log_level', _('Уровень логов xray'));
		o.value('none', _('Выключены (none)'));
		o.value('error', 'error');
		o.value('warning', 'warning');
		o.value('info', 'info');
		o.value('debug', 'debug');

		o = s.option(form.Value, 'tproxy_port', _('Порт TPROXY'));
		o.datatype = 'port';
		o.placeholder = '1234';

		// outbound
		s = m.section(form.NamedSection, 'proxy', 'outbound', _('Outbound'),
			_('Способ задания сервера. tag и streamSettings.sockopt.mark=255 (анти-петля) ' +
			  'добавляются автоматически в любом случае.'));
		s.addremove = false;

		o = s.option(form.ListValue, 'config_type', _('Способ'));
		o.value('outbound', _('Сырой JSON (outbound)'));
		o.value('url', _('Ссылка (vless / trojan / ss / vmess)'));
		o.value('subscription', _('Подписка (sub-ссылка)'));

		o = s.option(form.Value, 'proxy_url', _('Ссылка на сервер'),
			_('vless://… , trojan://… , ss://… , vmess://… — распарсится в outbound автоматически'));
		o.depends('config_type', 'url');
		o.placeholder = 'vless://uuid@host:443?type=xhttp&security=reality&pbk=...&sid=...&sni=...#name';

		o = s.option(form.Value, 'sub_url', _('URL подписки'),
			_('Ссылка на подписку (base64 или список ссылок). Жми «Обновить подписку» после ввода.'));
		o.depends('config_type', 'subscription');
		o.placeholder = 'https://example.com/sub/xxxx';

		o = s.option(form.Value, 'sub_select', _('Выбор сервера'),
			_('Номер (1,2,3…) или часть имени. Пусто = первый из подписки.'));
		o.depends('config_type', 'subscription');
		o.placeholder = '1';

		o = s.option(form.ListValue, 'sub_interval', _('Автообновление подписки'),
			_('1й раз качается напрямую, дальше — сама через VPN'));
		o.depends('config_type', 'subscription');
		o.value('off', _('Выключено'));
		o.value('hourly', _('Каждый час'));
		o.value('12h', _('Каждые 12 часов'));
		o.value('daily', _('Раз в день'));
		o.value('weekly', _('Раз в неделю'));

		o = s.option(form.TextValue, 'outbound_json', _('Outbound JSON'),
			_('Объект outbound Xray целиком (network/security/sockopt и т.д.)'));
		o.depends('config_type', 'outbound');
		o.rows = 16;
		o.monospace = true;
		o.validate = function(sid, val) {
			if (!val) return true;
			try { JSON.parse(val); return true; }
			catch (e) { return _('Невалидный JSON: ') + e.message; }
		};

		// dns
		s = m.section(form.NamedSection, 'dns', 'dns', _('DNS'),
			_('Заблокированные домены резолвятся через чистый резолвер (dnsproxy), ' +
			  'чтобы провайдер не подменял их IP. Остальной DNS — как обычно.'));
		s.addremove = false;

		o = s.option(form.ListValue, 'dns_type', _('Тип'));
		o.value('off', _('Выключено (ISP DNS)'));
		o.value('doh', 'DNS-over-HTTPS');
		o.value('dot', 'DNS-over-TLS');
		o.value('udp', _('Обычный UDP'));

		o = s.option(form.Value, 'dns_server', _('Основной DNS'),
			_('Выбери готовый или впиши свой. DoH — URL, DoT/UDP — IP.'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.depends('dns_type', 'udp');
		o.value('https://1.1.1.1/dns-query',            'Cloudflare · DoH (1.1.1.1)');
		o.value('https://8.8.8.8/dns-query',            'Google · DoH (8.8.8.8)');
		o.value('https://9.9.9.9/dns-query',            'Quad9 · DoH (9.9.9.9)');
		o.value('https://dns.adguard-dns.com/dns-query','AdGuard · DoH (94.140.14.14)');
		o.value('https://77.88.8.8/dns-query',          'Yandex · DoH (77.88.8.8)');
		o.value('1.1.1.1',  'Cloudflare · IP (1.1.1.1)');
		o.value('8.8.8.8',  'Google · IP (8.8.8.8)');
		o.value('9.9.9.9',  'Quad9 · IP (9.9.9.9)');
		o.value('77.88.8.8','Yandex · IP (77.88.8.8)');
		o.placeholder = 'https://1.1.1.1/dns-query';

		o = s.option(form.Value, 'bootstrap', _('Bootstrap DNS'),
			_('Чем резолвить адрес DoH/DoT-сервера (обычный IP)'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.value('1.1.1.1',  'Cloudflare (1.1.1.1)');
		o.value('8.8.8.8',  'Google (8.8.8.8)');
		o.value('9.9.9.9',  'Quad9 (9.9.9.9)');
		o.value('77.88.8.8','Yandex (77.88.8.8)');
		o.placeholder = '77.88.8.8';

		o = s.option(form.Value, 'rewrite_ttl', _('TTL ответов'),
			_('Резать TTL (сек), чтобы IP в nftset не протухали. По умолчанию 60'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.depends('dns_type', 'udp');
		o.datatype = 'uinteger';
		o.placeholder = '60';

		// списки (файлы)
		s = m.section(form.NamedSection, 'lists', 'lists', _('Списки'));
		s.addremove = false;

		fileOption(s, 'domains', _('Домены'),
			_('По одному домену в строке; поддомены матчатся автоматически'), preload, 10);
		fileOption(s, 'subnets', _('Подсети (CIDR)'),
			_('IPv4/IPv6 сети через прокси, по одной в строке'), preload, 6);
		fileOption(s, 'exclude', _('Исключения (всегда напрямую)'),
			_('IP/подсети, которые НЕ гнать через туннель (устройство, сервис)'), preload, 5);

		// url-источники
		s = m.section(form.NamedSection, 'lists', 'lists', _('URL-источники списков'),
			_('Жми «Обновить списки» после изменения. Раздельно для доменов и для CIDR.'));
		s.addremove = false;

		fileOption(s, 'url_domains', _('URL списков доменов'),
			_('Ссылки на списки доменов (по одной в строке)'), preload, 5);
		fileOption(s, 'url_subnets', _('URL списков CIDR'),
			_('Ссылки на списки подсетей/CIDR (по одной в строке)'), preload, 5);

		// после сохранения перезапускаем
		var origSaveApply = m.handleSaveApply;
		m.handleSaveApply = function(ev, mode) {
			return origSaveApply.call(m, ev, mode).then(function() {
				return fs.exec('/etc/init.d/fortochka', [ 'restart' ]).then(function(r) {
					var out = (r && (r.stdout || r.stderr)) || '';
					ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' },
						_('Форточка перезапущена') + '\n' + out), 'info');
				});
			});
		};

		return m.render();
	}
});

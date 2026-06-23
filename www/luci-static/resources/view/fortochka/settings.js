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
	exclude:     '/etc/fortochka/exclude.lst',
	dev_proxy:   '/etc/fortochka/dev_proxy.lst',
	dev_direct:  '/etc/fortochka/dev_direct.lst'
};

var CARD = 'margin:0;padding:12px 14px;background:rgba(127,127,127,.08);' +
	'border:1px solid rgba(127,127,127,.25);border-radius:8px;' +
	'font-size:12px;line-height:1.55;white-space:pre-wrap;overflow:auto';
var BAR = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px';
var BTN = 'border-radius:7px;padding:6px 14px;font-weight:500;cursor:pointer';

function runCmd(bin, args, okMsg) {
	ui.showModal(_('Working…'), [ E('p', { 'class': 'spinning' }, _('Please wait…')) ]);
	return fs.exec(bin, args).then(function(res) {
		ui.hideModal();
		var out = (res && (res.stdout || res.stderr)) || '';
		ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' },
			(okMsg ? okMsg + '\n' : '') + out), 'info');
	}).catch(function(e) {
		ui.hideModal();
		ui.addNotification(null, E('p', _('Error: ') + e), 'error');
	});
}

function cmdBtn(label, cls, bin, args, okMsg) {
	return E('button', {
		'class': 'btn cbi-button ' + cls, 'style': BTN,
		'click': function() { return runCmd(bin, args, okMsg); }
	}, label);
}

// country code -> flag emoji
function flag(cc) {
	if (!cc || cc.length !== 2 || !/^[a-z]{2}$/i.test(cc)) return '';
	return String.fromCodePoint.apply(null, cc.toUpperCase().split('').map(function(c) {
		return 0x1F1E6 + c.charCodeAt(0) - 65;
	}));
}

function fmtSpeed(b) {
	if (!b || b < 0) b = 0;
	if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB/s';
	if (b >= 1024)    return (b / 1024).toFixed(0) + ' KB/s';
	return b.toFixed(0) + ' B/s';
}

// file-backed textarea (not uci)
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
			L.resolveDefault(fs.read(FILES.exclude), ''),
			L.resolveDefault(fs.read(FILES.dev_proxy), ''),
			L.resolveDefault(fs.read(FILES.dev_direct), '')
		]);
	},

	render: function(data) {
		var statusOut = (data[0] && data[0].stdout) ? data[0].stdout : _('no data');
		var logsOut = (data[5] && data[5].stdout) ? data[5].stdout : _('no logs');
		var preload = {
			domains:     data[1] || '',
			subnets:     data[2] || '',
			url_domains: data[3] || '',
			url_subnets: data[4] || '',
			exclude:     data[6] || '',
			dev_proxy:   data[7] || '',
			dev_direct:  data[8] || ''
		};
		var m, s, o;

		m = new form.Map('fortochka', _('Fortochka'),
			_('Lightweight bypass router for OpenWrt: Xray + nftables (TPROXY) + dnsmasq. ' +
			  'Full-tunnel or domain/subnet based routing.'));

		// status + live stats + buttons
		s = m.section(form.TypedSection, '_status');
		s.anonymous = true;
		s.cfgsections = function() { return [ '_status' ]; };
		s.render = function() {
			var live = E('div', {
				'style': 'display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;font-variant-numeric:tabular-nums'
			}, [
				E('span', {}, [ '🌍 ', _('exit:') + ' ', E('b', { 'id': 'ft-exit' }, '…') ]),
				E('span', { 'id': 'ft-speed' }, '↑ …   ↓ …')
			]);
			var box = E('pre', { 'id': 'ft-status', 'style': CARD }, statusOut);

			poll.add(function() {
				return fs.exec('/usr/bin/fortochka', [ 'status' ]).then(function(r) {
					var el = document.getElementById('ft-status');
					if (el && r && r.stdout) el.textContent = r.stdout;
				}).catch(function() {});
			}, 10);

			// live speed from xray stats (byte counters delta)
			var pUp = null, pDn = null, pT = null;
			poll.add(function() {
				return fs.exec('/usr/bin/fortochka', [ 'stats' ]).then(function(r) {
					var p = (((r && r.stdout) || '0 0').trim().split(/\s+/));
					var up = +p[0] || 0, dn = +p[1] || 0, t = Date.now();
					var el = document.getElementById('ft-speed');
					if (pT !== null && el) {
						var dt = (t - pT) / 1000 || 1;
						el.textContent = '↑ ' + fmtSpeed((up - pUp) / dt) + '   ↓ ' + fmtSpeed((dn - pDn) / dt);
					}
					pUp = up; pDn = dn; pT = t;
				}).catch(function() {});
			}, 3);

			// exit ip + flag (once)
			fs.exec('/usr/bin/fortochka', [ 'exit-info' ]).then(function(r) {
				var p = (((r && r.stdout) || '- --').trim().split(/\s+/));
				var el = document.getElementById('ft-exit');
				if (el) el.textContent = p[0] + ' ' + flag(p[1]);
			}).catch(function() {});

			return E('div', { 'class': 'cbi-section' }, [
				E('h3', '🪟 ' + _('Status')),
				E('div', { 'class': 'cbi-section-node' }, [
					live, box,
					E('div', { 'style': BAR }, [
						cmdBtn('🔄 ' + _('Restart'),    'cbi-button-apply',  '/etc/init.d/fortochka', [ 'restart' ], _('Restarted')),
						cmdBtn('📥 ' + _('Lists'),       'cbi-button-action', '/usr/bin/fortochka',    [ 'update-lists' ], _('Lists updated')),
						cmdBtn('📡 ' + _('Subscription'),'cbi-button-action', '/usr/bin/fortochka',    [ 'sub-update' ], _('Subscription updated')),
						cmdBtn('⚡ ' + _('Speedtest'),   'cbi-button-action', '/usr/bin/fortochka',    [ 'speedtest' ], _('Measuring')),
						cmdBtn('⬆️ ' + _('Update'),      'cbi-button-action', '/usr/bin/fortochka',    [ 'upgrade' ], _('Updating from GitHub')),
						cmdBtn('⏻ ' + _('Off'),          'cbi-button-reset',  '/etc/init.d/fortochka', [ 'stop' ], _('Stopped'))
					])
				])
			]);
		};

		// logs
		s = m.section(form.TypedSection, '_logs');
		s.anonymous = true;
		s.cfgsections = function() { return [ '_logs' ]; };
		s.render = function() {
			var lbox = E('pre', { 'id': 'ft-logs', 'style': CARD + ';max-height:340px;font-size:11px' }, logsOut);
			return E('div', { 'class': 'cbi-section' }, [
				E('h3', '📋 ' + _('Logs')),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'style': 'margin-bottom:8px' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-action', 'style': BTN,
							'click': function() {
								return fs.exec('/usr/bin/fortochka', [ 'logs' ]).then(function(r) {
									var el = document.getElementById('ft-logs');
									if (el) el.textContent = (r && r.stdout) ? r.stdout : _('no logs');
								});
							}
						}, '🔁 ' + _('Refresh logs'))
					]),
					lbox
				])
			]);
		};

		// general
		s = m.section(form.NamedSection, 'main', 'fortochka', _('General'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('Mode'),
			_('all — route everything; domains — only domains/subnets from the lists'));
		o.value('domains', _('Lists only (domains)'));
		o.value('all', _('Everything (all)'));
		o.value('off', _('Off'));

		o = s.option(form.Flag, 'disable_quic', _('Block QUIC'),
			_('Drop UDP/443 so browsers fall back to TCP'));

		o = s.option(form.Flag, 'exclude_ntp', _('Bypass NTP'),
			_('Time sync (UDP/123) goes direct'));

		o = s.option(form.ListValue, 'watchdog', _('Watchdog'),
			_('Probe the tunnel and auto-restart Xray if it is dead'));
		o.value('off', _('Off'));
		o.value('1min', _('Every minute'));
		o.value('5min', _('Every 5 minutes'));
		o.value('10min', _('Every 10 minutes'));

		o = s.option(form.ListValue, 'update_interval', _('Lists auto-update'),
			_('Download remote lists on a schedule (cron)'));
		o.value('off', _('Off'));
		o.value('hourly', _('Hourly'));
		o.value('6h', _('Every 6 hours'));
		o.value('12h', _('Every 12 hours'));
		o.value('daily', _('Daily (04:00)'));
		o.value('2days', _('Every 2 days'));
		o.value('weekly', _('Weekly'));

		o = s.option(form.Flag, 'download_via_proxy', _('Download lists via VPN'),
			_('Fetch list URLs through the tunnel (SOCKS) instead of directly'));

		o = s.option(form.ListValue, 'log_level', _('Xray log level'));
		o.value('none', _('Off (none)'));
		o.value('error', 'error');
		o.value('warning', 'warning');
		o.value('info', 'info');
		o.value('debug', 'debug');

		o = s.option(form.Value, 'tproxy_port', _('TPROXY port'));
		o.datatype = 'port';
		o.placeholder = '1234';

		// outbound
		s = m.section(form.NamedSection, 'proxy', 'outbound', _('Outbound'),
			_('Server source. tag and streamSettings.sockopt.mark=255 (anti-loop) are added automatically.'));
		s.addremove = false;

		o = s.option(form.ListValue, 'config_type', _('Source'));
		o.value('outbound', _('Raw JSON (outbound)'));
		o.value('url', _('Link (vless / trojan / ss / vmess)'));
		o.value('subscription', _('Subscription (sub link)'));

		o = s.option(form.Value, 'proxy_url', _('Server link'),
			_('vless://… , trojan://… , ss://… , vmess://… — parsed into an outbound automatically'));
		o.depends('config_type', 'url');
		o.placeholder = 'vless://uuid@host:443?type=xhttp&security=reality&pbk=...&sid=...&sni=...#name';

		o = s.option(form.Value, 'sub_url', _('Subscription URL'),
			_('base64 or a list of links. Press “Subscription” after entering.'));
		o.depends('config_type', 'subscription');
		o.placeholder = 'https://example.com/sub/xxxx';

		o = s.option(form.Value, 'sub_select', _('Pick server'),
			_('Number (1,2,3…) or part of the name. Empty = first.'));
		o.depends('config_type', 'subscription');
		o.placeholder = '1';

		o = s.option(form.ListValue, 'sub_interval', _('Subscription auto-update'),
			_('First fetch is direct, later updates go through the VPN'));
		o.depends('config_type', 'subscription');
		o.value('off', _('Off'));
		o.value('hourly', _('Hourly'));
		o.value('12h', _('Every 12 hours'));
		o.value('daily', _('Daily'));
		o.value('weekly', _('Weekly'));

		o = s.option(form.Flag, 'failover', _('Auto-failover'),
			_('Use ALL servers from the subscription; Xray keeps the fastest alive one (least-ping) and switches on failure. Needs 2+ servers.'));
		o.depends('config_type', 'subscription');

		o = s.option(form.TextValue, 'outbound_json', _('Outbound JSON'),
			_('Full Xray outbound object (network/security/sockopt etc.)'));
		o.depends('config_type', 'outbound');
		o.rows = 16;
		o.monospace = true;
		o.validate = function(sid, val) {
			if (!val) return true;
			try { JSON.parse(val); return true; }
			catch (e) { return _('Invalid JSON: ') + e.message; }
		};

		// dns
		s = m.section(form.NamedSection, 'dns', 'dns', _('DNS'),
			_('Blocked domains are resolved through a clean resolver (dnsproxy) so the ISP can not spoof their IPs.'));
		s.addremove = false;

		o = s.option(form.ListValue, 'dns_type', _('Type'));
		o.value('off', _('Off (ISP DNS)'));
		o.value('doh', 'DNS-over-HTTPS');
		o.value('dot', 'DNS-over-TLS');
		o.value('udp', _('Plain UDP'));

		o = s.option(form.Value, 'dns_server', _('Main DNS'),
			_('Pick a preset or type your own. DoH — URL, DoT/UDP — IP.'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.depends('dns_type', 'udp');
		o.value('https://1.1.1.1/dns-query',             'Cloudflare · DoH (1.1.1.1)');
		o.value('https://8.8.8.8/dns-query',             'Google · DoH (8.8.8.8)');
		o.value('https://9.9.9.9/dns-query',             'Quad9 · DoH (9.9.9.9)');
		o.value('https://dns.adguard-dns.com/dns-query', 'AdGuard · DoH (94.140.14.14)');
		o.value('https://77.88.8.8/dns-query',           'Yandex · DoH (77.88.8.8)');
		o.value('1.1.1.1',  'Cloudflare · IP (1.1.1.1)');
		o.value('8.8.8.8',  'Google · IP (8.8.8.8)');
		o.value('9.9.9.9',  'Quad9 · IP (9.9.9.9)');
		o.value('77.88.8.8','Yandex · IP (77.88.8.8)');
		o.placeholder = 'https://1.1.1.1/dns-query';

		o = s.option(form.Value, 'bootstrap', _('Bootstrap DNS'),
			_('Resolves the DoH/DoT server hostname (plain IP)'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.value('1.1.1.1',  'Cloudflare (1.1.1.1)');
		o.value('8.8.8.8',  'Google (8.8.8.8)');
		o.value('9.9.9.9',  'Quad9 (9.9.9.9)');
		o.value('77.88.8.8','Yandex (77.88.8.8)');
		o.placeholder = '77.88.8.8';

		o = s.option(form.Value, 'rewrite_ttl', _('Answer TTL'),
			_('Cap TTL (sec) so nftset entries stay fresh. Default 60'));
		o.depends('dns_type', 'doh');
		o.depends('dns_type', 'dot');
		o.depends('dns_type', 'udp');
		o.datatype = 'uinteger';
		o.placeholder = '60';

		// lists (file textareas)
		s = m.section(form.NamedSection, 'lists', 'lists', _('Lists'));
		s.addremove = false;

		fileOption(s, 'domains', _('Domains'),
			_('One domain per line, subdomains matched automatically'), preload, 10);
		fileOption(s, 'subnets', _('Subnets (CIDR)'),
			_('IPv4/IPv6 networks routed through the proxy'), preload, 6);
		fileOption(s, 'exclude', _('Exclusions (always direct)'),
			_('Destination IP/subnets that never go through the tunnel'), preload, 5);

		// url sources
		s = m.section(form.NamedSection, 'lists', 'lists', _('URL sources'),
			_('Press “Lists” after editing. Separate for domains and CIDR.'));
		s.addremove = false;

		fileOption(s, 'url_domains', _('Domain list URLs'),
			_('Links to domain lists (one per line)'), preload, 5);
		fileOption(s, 'url_subnets', _('CIDR list URLs'),
			_('Links to subnet/CIDR lists (one per line)'), preload, 5);

		// per-device routing
		s = m.section(form.NamedSection, 'lists', 'lists', _('Per-device routing'),
			_('Force a device fully through the VPN or always direct. One IP or MAC per line.'));
		s.addremove = false;

		fileOption(s, 'dev_proxy', _('Always via VPN'),
			_('These devices route ALL traffic through the tunnel (e.g. your phone)'), preload, 5);
		fileOption(s, 'dev_direct', _('Always direct'),
			_('These devices never use the tunnel (e.g. smart TV)'), preload, 5);

		// restart after save
		var origSaveApply = m.handleSaveApply;
		m.handleSaveApply = function(ev, mode) {
			return origSaveApply.call(m, ev, mode).then(function() {
				return fs.exec('/etc/init.d/fortochka', [ 'restart' ]).then(function(r) {
					var out = (r && (r.stdout || r.stderr)) || '';
					ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' },
						_('Fortochka restarted') + '\n' + out), 'info');
				});
			});
		};

		return m.render();
	}
});

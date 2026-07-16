/*
 * TelegramRedirect.js for Surge
 * 稳定版：返回本地 HTML 跳转页，而不是单纯 302 到自定义 URL Scheme。
 * 这样在 iOS AppleWebKit / in-app browser 中更容易触发第三方 Telegram 客户端。
 */

(function () {
  'use strict';

  var CLIENTS = {
    telegram: { schemes: ['tg'], mode: 'native' },
    tg: { schemes: ['tg'], mode: 'native' },

    swiftgram: { schemes: ['sg', 'swiftgram'], mode: 'parseurl' },
    sg: { schemes: ['sg', 'swiftgram'], mode: 'parseurl' },

    turrit: { schemes: ['turrit'], mode: 'parseurl' },

    ime: { schemes: ['ime'], mode: 'parseurl' },
    imemessenger: { schemes: ['ime'], mode: 'parseurl' },

    nicegram: { schemes: ['nicegram', 'ng'], mode: 'parseurl' },
    ng: { schemes: ['ng', 'nicegram'], mode: 'parseurl' },

    lingogram: { schemes: ['lingogram', 'lingo'], mode: 'parseurl' },
    lingo: { schemes: ['lingo', 'lingogram'], mode: 'parseurl' }
  };

  function finish(value) {
    $done(value || {});
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
    } catch (_) {
      return String(value || '');
    }
  }

  function enc(value) {
    return encodeURIComponent(String(value == null ? '' : value));
  }

  function htmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeClientName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]+/g, '');
  }

  function readArgumentValue(arg) {
    arg = String(arg || '').trim();

    if (!arg || /\{\{\{.+\}\}\}/.test(arg)) {
      return 'Telegram';
    }

    var pairs = arg.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var pos = pair.indexOf('=');
      if (pos < 0) continue;

      var key = safeDecode(pair.slice(0, pos)).trim().toLowerCase();
      var val = safeDecode(pair.slice(pos + 1)).trim();

      if (key === 'client' || key === '客户端' || key === '跳转客户端') {
        return val || 'Telegram';
      }
    }

    var firstEqual = arg.indexOf('=');
    if (firstEqual >= 0) {
      return safeDecode(arg.slice(firstEqual + 1)).trim() || 'Telegram';
    }

    return safeDecode(arg).trim() || 'Telegram';
  }

  function parseCustomClient(name) {
    var m = String(name || '')
      .trim()
      .toLowerCase()
      .match(/^([a-z][a-z0-9+.-]*):(native|parseurl)$/);

    if (!m) return null;

    return {
      schemes: [m[1]],
      mode: m[2],
      name: name
    };
  }

  function getTarget() {
    var rawArg = typeof $argument === 'undefined' ? '' : $argument;
    var name = readArgumentValue(rawArg);
    var custom = parseCustomClient(name);

    if (custom) return custom;

    var key = normalizeClientName(name);
    var target = CLIENTS[key];

    if (target) {
      return {
        schemes: target.schemes,
        mode: target.mode,
        name: name
      };
    }

    if (/^[a-z][a-z0-9+.-]*$/i.test(name)) {
      return {
        schemes: [name],
        mode: 'parseurl',
        name: name
      };
    }

    return {
      schemes: ['tg'],
      mode: 'native',
      name: 'Telegram'
    };
  }

  function parseHttpUrl(url) {
    var m = String(url || '').match(/^(https?):\/\/([^\/?#]+)([^?#]*)?(\?[^#]*)?/i);
    if (!m) return null;

    return {
      protocol: m[1].toLowerCase(),
      host: m[2].toLowerCase(),
      path: m[3] || '/',
      query: m[4] ? m[4].slice(1) : ''
    };
  }

  function isTelegramHost(host) {
    return (
      host === 't.me' ||
      host === 'telegram.me' ||
      host === 'telegram.dog' ||
      /^[a-z0-9_]{2,32}\.t\.me$/i.test(host)
    );
  }

  function normalizeTelegramParts(parts) {
    var host = parts.host;
    var path = parts.path || '/';
    var sub = host.match(/^([a-z0-9_]{2,32})\.t\.me$/i);

    if (sub && sub[1].toLowerCase() !== 'www') {
      path = '/' + sub[1] + (path === '/' ? '' : path);
      host = 't.me';
    }

    return {
      host: host,
      path: path,
      query: parts.query || ''
    };
  }

  function toTelegramHttps(parts) {
    var p = normalizeTelegramParts(parts);
    return 'https://t.me' + (p.path || '/') + (p.query ? '?' + p.query : '');
  }

  function splitPath(path) {
    var raw = String(path || '/').replace(/^\/+|\/+$/g, '');
    if (!raw) return [];

    var arr = raw.split('/');
    for (var i = 0; i < arr.length; i++) {
      arr[i] = safeDecode(arr[i]);
    }
    return arr;
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function addRawQuery(url, qs, separator) {
    if (!qs) return url;
    return url + (separator || '&') + qs;
  }

  function addPair(url, key, value) {
    if (value == null || value === '') return url;
    return url + '&' + key + '=' + enc(value);
  }

  function isNumeric(value) {
    return /^\d+$/.test(String(value || ''));
  }

  function buildNativeDeepLink(scheme, parts) {
    var p = normalizeTelegramParts(parts);
    var seg = splitPath(p.path);
    var qs = p.query || '';

    if (!seg.length) {
      return scheme + '://chats';
    }

    var first = seg[0];
    var firstLower = lower(first);

    if (firstLower === 's' && seg[1]) {
      var previewUrl = scheme + '://resolve?domain=' + enc(seg[1]);
      if (seg[2] && isNumeric(seg[2])) {
        previewUrl = addPair(previewUrl, 'post', seg[2]);
      }
      return addRawQuery(previewUrl, qs, '&');
    }

    if (first.charAt(0) === '+') {
      var plus = first.slice(1);
      if (/^\d{5,15}$/.test(plus)) {
        return addRawQuery(scheme + '://resolve?phone=' + enc(plus), qs, '&');
      }
      return scheme + '://join?invite=' + enc(plus);
    }

    if (firstLower === 'joinchat' && seg[1]) {
      return scheme + '://join?invite=' + enc(seg[1]);
    }

    if (firstLower === 'share' || (firstLower === 'msg' && lower(seg[1]) === 'url')) {
      return scheme + '://msg_url' + (qs ? '?' + qs : '');
    }

    if (firstLower === 'proxy') {
      return scheme + '://proxy' + (qs ? '?' + qs : '');
    }

    if (firstLower === 'socks') {
      return scheme + '://socks' + (qs ? '?' + qs : '');
    }

    if (firstLower === 'confirmphone') {
      return scheme + '://confirmphone' + (qs ? '?' + qs : '');
    }

    if (firstLower === 'oauth') {
      return scheme + '://oauth' + (qs ? '?' + qs : '');
    }

    if (firstLower === 'addstickers' && seg[1]) {
      return scheme + '://addstickers?set=' + enc(seg[1]);
    }

    if (firstLower === 'addemoji' && seg[1]) {
      return scheme + '://addemoji?set=' + enc(seg[1]);
    }

    if (firstLower === 'addlist' && seg[1]) {
      return scheme + '://addlist?slug=' + enc(seg[1]);
    }

    if (firstLower === 'addtheme' && seg[1]) {
      return scheme + '://addtheme?slug=' + enc(seg[1]);
    }

    if (firstLower === 'addstyle' && seg[1]) {
      return scheme + '://addstyle?slug=' + enc(seg[1]);
    }

    if (firstLower === 'contact' && seg[1]) {
      return scheme + '://contact?token=' + enc(seg[1]);
    }

    if (firstLower === 'call' && seg[1]) {
      return scheme + '://call?slug=' + enc(seg[1]);
    }

    if (firstLower === 'm' && seg[1]) {
      return scheme + '://message?slug=' + enc(seg[1]);
    }

    if (firstLower === 'login' && seg[1]) {
      return scheme + '://login?code=' + enc(seg[1]);
    }

    if (firstLower === 'invoice' && seg[1]) {
      return scheme + '://invoice?slug=' + enc(seg[1]);
    }

    if (first.charAt(0) === '$' && first.length > 1) {
      return scheme + '://invoice?slug=' + enc(first.slice(1));
    }

    if (firstLower === 'setlanguage' && seg[1]) {
      return scheme + '://setlanguage?lang=' + enc(seg[1]);
    }

    if (firstLower === 'giftcode' && seg[1]) {
      return scheme + '://giftcode?slug=' + enc(seg[1]);
    }

    if (firstLower === 'c' && seg[1] && seg[2]) {
      var privateUrl;
      if (seg[3] && isNumeric(seg[2]) && isNumeric(seg[3])) {
        privateUrl = scheme + '://privatepost?channel=' + enc(seg[1]) + '&post=' + enc(seg[3]) + '&thread=' + enc(seg[2]);
      } else {
        privateUrl = scheme + '://privatepost?channel=' + enc(seg[1]) + '&post=' + enc(seg[2]);
      }
      return addRawQuery(privateUrl, qs, '&');
    }

    if (firstLower === 'bg' && seg[1]) {
      return addRawQuery(scheme + '://bg?slug=' + enc(seg.slice(1).join('/')), qs, '&');
    }

    var domain = first.replace(/^@+/, '');
    var result = scheme + '://resolve?domain=' + enc(domain);

    if (seg[1]) {
      var second = seg[1];
      var secondLower = lower(second);

      if (secondLower === 's' && seg[2]) {
        result = addPair(result, 'story', seg[2]);
      } else if (secondLower === 'a' && seg[2]) {
        result = addPair(result, 'album', seg[2]);
      } else if (seg[2] && isNumeric(second) && isNumeric(seg[2])) {
        result = addPair(result, 'post', seg[2]);
        result = addPair(result, 'thread', second);
      } else if (isNumeric(second)) {
        result = addPair(result, 'post', second);
      } else if (qs && /(?:^|&)startapp(?:=|&|$)/.test(qs)) {
        result = addPair(result, 'appname', second);
      }
    }

    return addRawQuery(result, qs, '&');
  }

  function buildDeepLinkForScheme(scheme, mode, parts, normalizedHttps) {
    if (mode === 'parseurl') {
      return scheme + '://parseurl?url=' + enc(normalizedHttps);
    }
    return buildNativeDeepLink(scheme, parts);
  }

  function buildHtml(location, fallbackLocations, normalizedHttps, targetName) {
    var linksHtml = '';
    for (var i = 0; i < fallbackLocations.length; i++) {
      linksHtml += '<a class="button secondary" href="' + htmlEscape(fallbackLocations[i]) + '">备用打开 ' + (i + 1) + '</a>';
    }

    var jsLocation = JSON.stringify(location);

    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">'
      + '<meta http-equiv="refresh" content="0;url=' + htmlEscape(location) + '">'
      + '<title>Telegram Redirect</title>'
      + '<style>body{margin:0;background:#f5f5f7;color:#111;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{width:min(88vw,420px);background:#fff;border-radius:22px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.08);text-align:center}.title{font-size:22px;font-weight:700;margin:0 0 10px}.sub{font-size:14px;color:#666;line-height:1.45;margin:0 0 20px}.button{display:block;text-decoration:none;background:#007aff;color:white;border-radius:14px;padding:14px 16px;font-weight:700;margin:10px 0}.secondary{background:#e9e9ee;color:#111}.hint{font-size:12px;color:#999;margin-top:14px;word-break:break-all}</style>'
      + '</head><body><div class="card">'
      + '<p class="title">正在打开 ' + htmlEscape(targetName || 'Telegram') + '</p>'
      + '<p class="sub">如果没有自动跳转，请点下面按钮手动打开。</p>'
      + '<a class="button" href="' + htmlEscape(location) + '">打开客户端</a>'
      + linksHtml
      + '<a class="button secondary" href="' + htmlEscape(normalizedHttps) + '">打开原始链接</a>'
      + '<p class="hint">' + htmlEscape(location) + '</p>'
      + '</div><script>setTimeout(function(){window.location.replace(' + jsLocation + ');},50);setTimeout(function(){window.location.href=' + jsLocation + ';},650);</script></body></html>';
  }

  try {
    var requestUrl = $request && $request.url ? $request.url : '';
    var parsed = parseHttpUrl(requestUrl);

    if (!parsed || !isTelegramHost(parsed.host)) {
      return finish({});
    }

    var target = getTarget();
    var normalizedHttps = toTelegramHttps(parsed);
    var primary = buildDeepLinkForScheme(target.schemes[0], target.mode, parsed, normalizedHttps);
    var fallbacks = [];

    for (var i = 1; i < target.schemes.length; i++) {
      fallbacks.push(buildDeepLinkForScheme(target.schemes[i], target.mode, parsed, normalizedHttps));
    }

    if (!primary) {
      console.log('[TelegramRedirect] no target, passthrough: ' + requestUrl);
      return finish({});
    }

    console.log('[TelegramRedirect] client=' + target.name + ', location=' + primary);

    finish({
      response: {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Telegram-Redirect-Client': String(target.name || ''),
          'X-Telegram-Redirect-Location': primary
        },
        body: buildHtml(primary, fallbacks, normalizedHttps, target.name)
      }
    });
  } catch (e) {
    console.log('[TelegramRedirect] error: ' + (e && e.message ? e.message : e));
    finish({});
  }
})();

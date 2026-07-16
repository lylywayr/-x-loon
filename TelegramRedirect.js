/*
 * TelegramRedirect.js for Surge
 * v20260716-3
 *
 * 将 t.me / telegram.me / telegram.dog 链接重定向到官方 Telegram 或第三方 Telegram 客户端。
 * 默认对第三方客户端使用 native deep link：scheme://resolve / scheme://privatepost / scheme://join。
 * 只有手动填写 xxx:parseurl 时才使用 scheme://parseurl?url=...
 */
(function () {
  'use strict';

  var CLIENTS = {
    telegram: { schemes: ['tg'], mode: 'native' },
    tg: { schemes: ['tg'], mode: 'native' },

    swiftgram: { schemes: ['sg', 'swiftgram'], mode: 'native' },
    sg: { schemes: ['sg', 'swiftgram'], mode: 'native' },

    turrit: { schemes: ['turrit'], mode: 'native' },

    ime: { schemes: ['ime'], mode: 'native' },
    imemessenger: { schemes: ['ime'], mode: 'native' },

    nicegram: { schemes: ['nicegram', 'ng'], mode: 'native' },
    ng: { schemes: ['ng', 'nicegram'], mode: 'native' },

    lingogram: { schemes: ['lingogram', 'lingo'], mode: 'native' },
    lingo: { schemes: ['lingo', 'lingogram'], mode: 'native' }
  };

  var RESERVED_SUBDOMAINS = {
    addemoji: true,
    addlist: true,
    addstickers: true,
    addstyle: true,
    addtheme: true,
    auction: true,
    auth: true,
    boost: true,
    call: true,
    confirmphone: true,
    contact: true,
    giftcode: true,
    invoice: true,
    joinchat: true,
    login: true,
    m: true,
    nft: true,
    proxy: true,
    setlanguage: true,
    share: true,
    socks: true,
    web: true,
    a: true,
    k: true,
    z: true,
    www: true
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

    // 未知但符合 URL Scheme 规则的客户端名，默认按 native Telegram deep link 处理。
    if (/^[a-z][a-z0-9+.-]*$/i.test(name)) {
      return {
        schemes: [name],
        mode: 'native',
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
      /^[a-z0-9_]+\.t\.me$/i.test(host)
    );
  }

  function normalizeTelegramParts(parts) {
    var host = parts.host;
    var path = parts.path || '/';
    var sub = host.match(/^([a-z0-9_]+)\.t\.me$/i);

    if (sub) {
      var username = sub[1];
      var key = username.toLowerCase();

      if (username.length > 1 && !RESERVED_SUBDOMAINS[key]) {
        path = '/' + username + (path === '/' ? '' : path);
        host = 't.me';
      }
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

  function addRawQuery(url, qs) {
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  function addPair(url, key, value) {
    if (value == null || value === '') return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + key + '=' + enc(value);
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

    // t.me/s/<username>[/<post>]：网页预览链接，打开原始频道或帖子。
    if (firstLower === 's' && seg[1]) {
      var previewUrl = scheme + '://resolve?domain=' + enc(seg[1]);
      if (seg[2] && isNumeric(seg[2])) {
        previewUrl = addPair(previewUrl, 'post', seg[2]);
      }
      return addRawQuery(previewUrl, qs);
    }

    // t.me/+<phone_number> 或 t.me/+<invite_hash>
    if (first.charAt(0) === '+') {
      var plus = first.slice(1);
      if (/^\d{5,15}$/.test(plus)) {
        return addRawQuery(scheme + '://resolve?phone=' + enc(plus), qs);
      }
      return addRawQuery(scheme + '://join?invite=' + enc(plus), qs);
    }

    if (firstLower === 'joinchat' && seg[1]) {
      return addRawQuery(scheme + '://join?invite=' + enc(seg[1]), qs);
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
      return addRawQuery(scheme + '://addstickers?set=' + enc(seg[1]), qs);
    }

    if (firstLower === 'addemoji' && seg[1]) {
      return addRawQuery(scheme + '://addemoji?set=' + enc(seg[1]), qs);
    }

    if (firstLower === 'addlist' && seg[1]) {
      return addRawQuery(scheme + '://addlist?slug=' + enc(seg[1]), qs);
    }

    if (firstLower === 'addtheme' && seg[1]) {
      return addRawQuery(scheme + '://addtheme?slug=' + enc(seg[1]), qs);
    }

    if (firstLower === 'addstyle' && seg[1]) {
      return addRawQuery(scheme + '://addstyle?slug=' + enc(seg[1]), qs);
    }

    if (firstLower === 'contact' && seg[1]) {
      return addRawQuery(scheme + '://contact?token=' + enc(seg[1]), qs);
    }

    if (firstLower === 'call' && seg[1]) {
      return addRawQuery(scheme + '://call?slug=' + enc(seg[1]), qs);
    }

    if (firstLower === 'm' && seg[1]) {
      return addRawQuery(scheme + '://message?slug=' + enc(seg[1]), qs);
    }

    if (firstLower === 'login' && seg[1]) {
      return addRawQuery(scheme + '://login?code=' + enc(seg[1]), qs);
    }

    if (firstLower === 'invoice' && seg[1]) {
      return addRawQuery(scheme + '://invoice?slug=' + enc(seg[1]), qs);
    }

    if (first.charAt(0) === '$' && first.length > 1) {
      return addRawQuery(scheme + '://invoice?slug=' + enc(first.slice(1)), qs);
    }

    if (firstLower === 'setlanguage' && seg[1]) {
      return addRawQuery(scheme + '://setlanguage?lang=' + enc(seg[1]), qs);
    }

    if (firstLower === 'giftcode' && seg[1]) {
      return addRawQuery(scheme + '://giftcode?slug=' + enc(seg[1]), qs);
    }

    // t.me/boost/<username> 或 t.me/boost?c=<id>
    if (firstLower === 'boost') {
      if (seg[1]) {
        return addRawQuery(scheme + '://boost?domain=' + enc(seg[1]), qs);
      }
      return scheme + '://boost' + (qs ? '?' + qs : '');
    }

    // 私有频道 / 群消息：t.me/c/<channel>/<post> 或 t.me/c/<channel>/<thread>/<post>
    if (firstLower === 'c' && seg[1] && seg[2]) {
      var privateUrl;
      if (seg[3] && isNumeric(seg[2]) && isNumeric(seg[3])) {
        privateUrl = scheme + '://privatepost?channel=' + enc(seg[1]) + '&post=' + enc(seg[3]) + '&thread=' + enc(seg[2]);
      } else {
        privateUrl = scheme + '://privatepost?channel=' + enc(seg[1]) + '&post=' + enc(seg[2]);
      }
      return addRawQuery(privateUrl, qs);
    }

    if (firstLower === 'bg' && seg[1]) {
      return addRawQuery(scheme + '://bg?slug=' + enc(seg.slice(1).join('/')), qs);
    }

    // 普通用户名、频道、公开帖子、话题、Story、Album、Mini App。
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

    return addRawQuery(result, qs);
  }

  function buildParseUrlDeepLink(scheme, normalizedHttps) {
    return scheme + '://parseurl?url=' + enc(normalizedHttps);
  }

  function buildDeepLinkForScheme(scheme, mode, parts, normalizedHttps) {
    if (mode === 'parseurl') {
      return buildParseUrlDeepLink(scheme, normalizedHttps);
    }
    return buildNativeDeepLink(scheme, parts);
  }

  function buildFallbacks(target, parts, normalizedHttps, primary) {
    var list = [];
    var seen = {};

    function push(value) {
      if (!value || value === primary || seen[value]) return;
      seen[value] = true;
      list.push(value);
    }

    for (var i = 0; i < target.schemes.length; i++) {
      var scheme = target.schemes[i];
      push(buildNativeDeepLink(scheme, parts));
      push(buildParseUrlDeepLink(scheme, normalizedHttps));
    }

    return list;
  }

  function buildHtml(location, fallbackLocations, normalizedHttps, targetName) {
    var linksHtml = '';
    for (var i = 0; i < fallbackLocations.length; i++) {
      linksHtml += '<a class="button secondary" href="' + htmlEscape(fallbackLocations[i]) + '">备用打开 ' + (i + 1) + '</a>';
    }

    var jsLocation = JSON.stringify(location);

    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">'
      + '<title>Telegram Redirect</title>'
      + '<style>body{margin:0;background:#f5f5f7;color:#111;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{width:min(88vw,420px);background:#fff;border-radius:22px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.08);text-align:center}.title{font-size:22px;font-weight:700;margin:0 0 10px}.sub{font-size:14px;color:#666;line-height:1.45;margin:0 0 20px}.button{display:block;text-decoration:none;background:#007aff;color:white;border-radius:14px;padding:14px 16px;font-weight:700;margin:10px 0}.secondary{background:#e9e9ee;color:#111}.hint{font-size:12px;color:#999;margin-top:14px;word-break:break-all}</style>'
      + '</head><body><div class="card">'
      + '<p class="title">正在打开 ' + htmlEscape(targetName || 'Telegram') + '</p>'
      + '<p class="sub">如果打开了客户端但没有进入对应页面，请返回这里点备用打开。</p>'
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
    var fallbacks = buildFallbacks(target, parsed, normalizedHttps, primary);

    if (!primary) {
      console.log('[TelegramRedirect] no target, passthrough: ' + requestUrl);
      return finish({});
    }

    console.log('[TelegramRedirect] client=' + target.name + ', mode=' + target.mode + ', location=' + primary);

    finish({
      response: {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Telegram-Redirect-Client': String(target.name || ''),
          'X-Telegram-Redirect-Mode': String(target.mode || ''),
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
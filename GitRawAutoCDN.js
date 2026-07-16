/*
 * GitRawAutoCDN.js for Surge
 * v20260716-2
 * GitHub Raw 可选反代版，单参数 CDN。
 *
 * CDN = OFF   不反代，直接放行
 * CDN = JSD   cdn.jsdelivr.net
 * CDN = JSD-F fastly.jsdelivr.net
 * CDN = JSD-G gcore.jsdelivr.net
 * CDN = GHP   ghproxy.net
 * CDN = GHP2  gh-proxy.com
 * CDN = GM    hub.gitmirror.com
 * CDN = LLKK  gh.llkk.cc
 * CDN = https://example.com/{url}  自定义反代
 */
(function () {
  'use strict';

  var RAW_RE = /^https?:\/\/raw\.githubusercontent\.com\/([^\/?#]+)\/([^\/?#]+)\/([^\/?#]+)\/([^?#]+)([?#].*)?$/i;

  function done(value) {
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

  function isPlaceholder(value) {
    return /\{\{\{.+\}\}\}/.test(String(value || ''));
  }

  function parseArguments(arg) {
    var result = {};
    var raw = String(arg || '').trim();

    if (!raw || isPlaceholder(raw)) return result;

    var pairs = raw.split('&');

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var pos = pair.indexOf('=');
      if (pos < 0) continue;

      var key = safeDecode(pair.slice(0, pos)).trim();
      var val = safeDecode(pair.slice(pos + 1)).trim();

      if (!key || isPlaceholder(val)) continue;
      result[key] = val;
    }

    return result;
  }

  function getCdnArgument(arg) {
    var raw = String(arg || '').trim();
    if (!raw || isPlaceholder(raw)) return '';

    var args = parseArguments(raw);
    var value = args.CDN || args.cdn || args['反代'] || args.proxy || args.Proxy || '';

    if (value) return value;

    // 兼容直接传入 JSD / GHP / https://example.com/{url} 这种裸值。
    if (raw.indexOf('=') < 0 && raw.indexOf('&') < 0) return safeDecode(raw);

    return '';
  }

  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/_/g, '-');
  }

  function shouldBypass(name) {
    var n = normalizeName(name);

    return (
      !n ||
      isPlaceholder(n) ||
      n === 'off' ||
      n === 'direct' ||
      n === 'none' ||
      n === 'false' ||
      n === '0' ||
      n === 'no' ||
      n === 'disable' ||
      n === 'disabled' ||
      n === '不反代' ||
      n === '不代理' ||
      n === '直连' ||
      n === '关闭' ||
      n === '禁用'
    );
  }

  function parseRawUrl(url) {
    var m = String(url || '').match(RAW_RE);
    if (!m) return null;

    return {
      rawUrl: url,
      user: m[1],
      repo: m[2],
      branch: m[3],
      path: m[4],
      suffix: m[5] || ''
    };
  }

  function jsDelivr(info, host) {
    return 'https://' + host + '/gh/' + info.user + '/' + info.repo + '@' + info.branch + '/' + info.path + info.suffix;
  }

  function wrap(info, host) {
    return 'https://' + host + '/' + info.rawUrl;
  }

  function buildCustom(info, template) {
    var raw = String(template || '').trim();

    if (!raw || isPlaceholder(raw)) return null;

    var result = raw
      .replace(/\{url\}/g, info.rawUrl)
      .replace(/\{url_encoded\}/g, enc(info.rawUrl))
      .replace(/\{user\}/g, info.user)
      .replace(/\{repo\}/g, info.repo)
      .replace(/\{branch\}/g, info.branch)
      .replace(/\{path\}/g, info.path)
      .replace(/\{path_encoded\}/g, enc(info.path));

    if (result !== raw) return result;

    // 没写占位符时，按“反代前缀 + 原始 Raw URL”处理。
    return raw.replace(/\/+$/, '') + '/' + info.rawUrl;
  }

  function buildTarget(info, cdnArg) {
    var n = normalizeName(cdnArg);

    if (shouldBypass(n)) return null;

    if (n === 'jsd' || n === 'jsdelivr' || n === 'cdn.jsdelivr.net') {
      return jsDelivr(info, 'cdn.jsdelivr.net');
    }

    if (n === 'jsd-f' || n === 'fastly' || n === 'fastly-jsdelivr' || n === 'fastly.jsdelivr.net') {
      return jsDelivr(info, 'fastly.jsdelivr.net');
    }

    if (n === 'jsd-g' || n === 'gcore' || n === 'gcore-jsdelivr' || n === 'gcore.jsdelivr.net') {
      return jsDelivr(info, 'gcore.jsdelivr.net');
    }

    if (n === 'ghp' || n === 'ghproxy' || n === 'ghproxy.net') {
      return wrap(info, 'ghproxy.net');
    }

    if (n === 'ghp2' || n === 'gh-proxy' || n === 'gh-proxy.com') {
      return wrap(info, 'gh-proxy.com');
    }

    if (n === 'gm' || n === 'gitmirror' || n === 'git-mirror' || n === 'hub.gitmirror.com') {
      return wrap(info, 'hub.gitmirror.com');
    }

    if (n === 'llkk' || n === 'gh.llkk.cc') {
      return wrap(info, 'gh.llkk.cc');
    }

    if (/^https?:\/\//i.test(cdnArg)) {
      return buildCustom(info, cdnArg);
    }

    // 未识别时默认不反代，避免误跳坏链接。
    return null;
  }

  try {
    var requestUrl = $request && $request.url ? $request.url : '';
    var info = parseRawUrl(requestUrl);

    if (!info) {
      console.log('[GitRawAutoCDN] not matched: ' + requestUrl);
      return done({});
    }

    var cdnArg = getCdnArgument(typeof $argument === 'undefined' ? '' : $argument);
    var target = buildTarget(info, cdnArg);

    if (!target) {
      console.log('[GitRawAutoCDN] bypass: ' + requestUrl + ', CDN=' + (cdnArg || 'OFF'));
      return done({});
    }

    console.log('[GitRawAutoCDN] CDN=' + cdnArg + ' -> ' + target);

    done({
      response: {
        status: 302,
        headers: {
          Location: target,
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
          'X-GitRawAutoCDN-CDN': String(cdnArg || ''),
          'X-GitRawAutoCDN-Target': target
        },
        body: ''
      }
    });
  } catch (e) {
    console.log('[GitRawAutoCDN] error: ' + (e && e.message ? e.message : e));
    done({});
  }
})();
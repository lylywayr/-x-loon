/*
 * Telegram 跳转脚本（Surge 版）
 *
 * 将 Telegram HTTPS 链接转换为官方 Telegram / 第三方客户端 deep link。
 * 支持 t.me / telegram.me / telegram.dog / username.t.me。
 * 支持官方 tg:// 规则、Swiftgram parseurl、第三方客户端兼容映射、自定义 scheme。
 */

(function () {
  "use strict";

  const CLIENTS = {
    telegram: { scheme: "tg", mode: "native" },
    tg: { scheme: "tg", mode: "native" },

    // Swiftgram 使用 parseurl 方式兼容性更高
    swiftgram: { scheme: "sg", mode: "parseurl" },
    sg: { scheme: "sg", mode: "parseurl" },

    // 第三方 Telegram 客户端兼容映射
    turrit: { scheme: "turrit", mode: "native" },
    ime: { scheme: "ime", mode: "native" },
    imemessenger: { scheme: "ime", mode: "native" },
    nicegram: { scheme: "ng", mode: "native" },
    ng: { scheme: "ng", mode: "native" },
    lingogram: { scheme: "lingo", mode: "native" },
    lingo: { scheme: "lingo", mode: "native" }
  };

  function finish(value) {
    $done(value || {});
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (_) {
      return String(value || "");
    }
  }

  function enc(value) {
    return encodeURIComponent(String(value == null ? "" : value));
  }

  function normalizeClientName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]+/g, "");
  }

  function readArgumentValue(arg) {
    arg = String(arg || "").trim();

    if (!arg || /\{\{\{.+\}\}\}/.test(arg)) {
      return "Telegram";
    }

    const pairs = arg.split("&");

    for (const pair of pairs) {
      const pos = pair.indexOf("=");
      if (pos < 0) continue;

      const key = safeDecode(pair.slice(0, pos)).trim().toLowerCase();
      const val = safeDecode(pair.slice(pos + 1)).trim();

      if (
        key === "client" ||
        key === "客户端" ||
        key === "跳转客户端"
      ) {
        return val || "Telegram";
      }
    }

    const firstEqual = arg.indexOf("=");
    if (firstEqual >= 0) {
      return safeDecode(arg.slice(firstEqual + 1)).trim() || "Telegram";
    }

    return safeDecode(arg).trim() || "Telegram";
  }

  function getTarget() {
    const rawArg = typeof $argument === "undefined" ? "" : $argument;
    const name = readArgumentValue(rawArg);
    const key = normalizeClientName(name);

    /*
     * 高级自定义：
     * example:native   -> example://resolve?domain=...
     * example:parseurl -> example://parseurl?url=https%3A%2F%2Ft.me%2F...
     */
    const custom = String(name || "")
      .trim()
      .toLowerCase()
      .match(/^([a-z][a-z0-9+.-]*):(native|parseurl)$/);

    if (custom) {
      return {
        scheme: custom[1],
        mode: custom[2],
        name
      };
    }

    const target = CLIENTS[key];

    if (target) {
      return {
        scheme: target.scheme,
        mode: target.mode,
        name
      };
    }

    // 未知但符合 URL Scheme 命名规则时，按自定义 native scheme 处理
    if (/^[a-z][a-z0-9+.-]*$/i.test(name)) {
      return {
        scheme: name,
        mode: "native",
        name
      };
    }

    return {
      scheme: "tg",
      mode: "native",
      name: "Telegram"
    };
  }

  function parseHttpUrl(url) {
    const m = String(url || "").match(/^(https?):\/\/([^\/?#]+)([^?#]*)?(\?[^#]*)?/i);

    if (!m) return null;

    return {
      protocol: m[1].toLowerCase(),
      host: m[2].toLowerCase(),
      path: m[3] || "/",
      query: m[4] ? m[4].slice(1) : ""
    };
  }

  function isTelegramHost(host) {
    return (
      host === "t.me" ||
      host === "telegram.me" ||
      host === "telegram.dog" ||
      /^[a-z0-9_]{2,32}\.t\.me$/i.test(host)
    );
  }

  function normalizeTelegramParts(parts) {
    let host = parts.host;
    let path = parts.path || "/";

    // username.t.me/path -> t.me/username/path
    const sub = host.match(/^([a-z0-9_]{2,32})\.t\.me$/i);

    if (sub && sub[1].toLowerCase() !== "www") {
      const username = sub[1];
      path = "/" + username + (path === "/" ? "" : path);
      host = "t.me";
    }

    return {
      host,
      path,
      query: parts.query || ""
    };
  }

  function toTelegramHttps(parts) {
    const p = normalizeTelegramParts(parts);
    return "https://t.me" + (p.path || "/") + (p.query ? "?" + p.query : "");
  }

  function splitPath(path) {
    const raw = String(path || "/").replace(/^\/+|\/+$/g, "");

    if (!raw) return [];

    return raw.split("/").map(safeDecode);
  }

  function lower(value) {
    return String(value || "").toLowerCase();
  }

  function addRawQuery(url, qs, separator) {
    if (!qs) return url;
    return url + (separator || "&") + qs;
  }

  function addPair(url, key, value) {
    if (value == null || value === "") return url;
    return url + "&" + key + "=" + enc(value);
  }

  function isNumeric(value) {
    return /^\d+$/.test(String(value || ""));
  }

  function buildNativeDeepLink(scheme, parts) {
    const p = normalizeTelegramParts(parts);
    const seg = splitPath(p.path);
    const qs = p.query || "";

    if (!seg.length) {
      return scheme + "://chats";
    }

    const first = seg[0];
    const firstLower = lower(first);

    /*
     * Telegram 网页预览链接：
     * t.me/s/<username>
     * t.me/s/<username>/<post>
     */
    if (firstLower === "s" && seg[1]) {
      let url = scheme + "://resolve?domain=" + enc(seg[1]);

      if (seg[2] && isNumeric(seg[2])) {
        url = addPair(url, "post", seg[2]);
      }

      return addRawQuery(url, qs, "&");
    }

    /*
     * t.me/+<phone_number>
     * t.me/+<invite_hash>
     */
    if (first.charAt(0) === "+") {
      const plus = first.slice(1);

      if (/^\d{5,15}$/.test(plus)) {
        return addRawQuery(scheme + "://resolve?phone=" + enc(plus), qs, "&");
      }

      return scheme + "://join?invite=" + enc(plus);
    }

    // t.me/joinchat/<hash>
    if (firstLower === "joinchat" && seg[1]) {
      return scheme + "://join?invite=" + enc(seg[1]);
    }

    // t.me/share/url?url=xxx&text=xxx / t.me/msg/url?url=xxx&text=xxx
    if (firstLower === "share" || (firstLower === "msg" && lower(seg[1]) === "url")) {
      return scheme + "://msg_url" + (qs ? "?" + qs : "");
    }

    // 代理链接
    if (firstLower === "proxy") {
      return scheme + "://proxy" + (qs ? "?" + qs : "");
    }

    if (firstLower === "socks") {
      return scheme + "://socks" + (qs ? "?" + qs : "");
    }

    // 手机号确认 / OAuth
    if (firstLower === "confirmphone") {
      return scheme + "://confirmphone" + (qs ? "?" + qs : "");
    }

    if (firstLower === "oauth") {
      return scheme + "://oauth" + (qs ? "?" + qs : "");
    }

    // 贴纸 / Emoji / 文件夹 / 主题 / AI composer tone
    if (firstLower === "addstickers" && seg[1]) {
      return scheme + "://addstickers?set=" + enc(seg[1]);
    }

    if (firstLower === "addemoji" && seg[1]) {
      return scheme + "://addemoji?set=" + enc(seg[1]);
    }

    if (firstLower === "addlist" && seg[1]) {
      return scheme + "://addlist?slug=" + enc(seg[1]);
    }

    if (firstLower === "addtheme" && seg[1]) {
      return scheme + "://addtheme?slug=" + enc(seg[1]);
    }

    if (firstLower === "addstyle" && seg[1]) {
      return scheme + "://addstyle?slug=" + enc(seg[1]);
    }

    // 联系人临时链接 / 通话 / 商业消息链接
    if (firstLower === "contact" && seg[1]) {
      return scheme + "://contact?token=" + enc(seg[1]);
    }

    if (firstLower === "call" && seg[1]) {
      return scheme + "://call?slug=" + enc(seg[1]);
    }

    if (firstLower === "m" && seg[1]) {
      return scheme + "://message?slug=" + enc(seg[1]);
    }

    // 登录码 / 发票 / 语言包 / Premium 礼品码
    if (firstLower === "login" && seg[1]) {
      return scheme + "://login?code=" + enc(seg[1]);
    }

    if (firstLower === "invoice" && seg[1]) {
      return scheme + "://invoice?slug=" + enc(seg[1]);
    }

    if (first.charAt(0) === "$" && first.length > 1) {
      return scheme + "://invoice?slug=" + enc(first.slice(1));
    }

    if (firstLower === "setlanguage" && seg[1]) {
      return scheme + "://setlanguage?lang=" + enc(seg[1]);
    }

    if (firstLower === "giftcode" && seg[1]) {
      return scheme + "://giftcode?slug=" + enc(seg[1]);
    }

    /*
     * 私有频道/群消息：
     * t.me/c/<channel>/<post>
     * t.me/c/<channel>/<thread>/<post>
     */
    if (firstLower === "c" && seg[1] && seg[2]) {
      let url;

      if (seg[3] && isNumeric(seg[2]) && isNumeric(seg[3])) {
        url =
          scheme +
          "://privatepost?channel=" +
          enc(seg[1]) +
          "&post=" +
          enc(seg[3]) +
          "&thread=" +
          enc(seg[2]);
      } else {
        url =
          scheme +
          "://privatepost?channel=" +
          enc(seg[1]) +
          "&post=" +
          enc(seg[2]);
      }

      return addRawQuery(url, qs, "&");
    }

    // 壁纸链接做通用 slug 入口并保留 query
    if (firstLower === "bg" && seg[1]) {
      const url = scheme + "://bg?slug=" + enc(seg.slice(1).join("/"));
      return addRawQuery(url, qs, "&");
    }

    /*
     * 普通用户名 / Bot / Mini App / Story / Album / 公开帖子
     */
    const domain = first.replace(/^@+/, "");
    let result = scheme + "://resolve?domain=" + enc(domain);

    if (seg[1]) {
      const second = seg[1];
      const secondLower = lower(second);

      // t.me/<username>/s/<story_id>
      if (secondLower === "s" && seg[2]) {
        result = addPair(result, "story", seg[2]);
      }

      // t.me/<username>/a/<album_id>
      else if (secondLower === "a" && seg[2]) {
        result = addPair(result, "album", seg[2]);
      }

      // t.me/<username>/<thread_id>/<post_id>
      else if (seg[2] && isNumeric(second) && isNumeric(seg[2])) {
        result = addPair(result, "post", seg[2]);
        result = addPair(result, "thread", second);
      }

      // t.me/<username>/<post_id>
      else if (isNumeric(second)) {
        result = addPair(result, "post", second);
      }

      // t.me/<bot_username>/<appname>?startapp=xxx
      else if (qs && /(?:^|&)startapp(?:=|&|$)/.test(qs)) {
        result = addPair(result, "appname", second);
      }
    }

    return addRawQuery(result, qs, "&");
  }

  try {
    const requestUrl = $request && $request.url ? $request.url : "";
    const parsed = parseHttpUrl(requestUrl);

    if (!parsed || !isTelegramHost(parsed.host)) {
      return finish({});
    }

    const target = getTarget();
    const normalizedHttps = toTelegramHttps(parsed);
    const location =
      target.mode === "parseurl"
        ? target.scheme + "://parseurl?url=" + enc(normalizedHttps)
        : buildNativeDeepLink(target.scheme, parsed);

    if (!location) {
      return finish({});
    }

    finish({
      response: {
        status: 302,
        headers: {
          Location: location,
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        },
        body: ""
      }
    });
  } catch (e) {
    console.log("[TelegramRedirect] " + e.message);
    finish({});
  }
})();

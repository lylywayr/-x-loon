/************************
 * 同程旅行签到 (Egern 专用)
 * 功能：捕获请求头 -> 每日签到
 * 兼容：Egern / Quantumult X 风格
 ************************/
const KEY = "tongcheng_sign_header";
const BASE_URL = "https://app.17u.cn/welfarecenter";

// 今日日期格式化
function todayStr() {
  const d = new Date();
  const pad = n => (n < 10 ? "0" + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ========= 如果是 HTTP 请求触发 =========
if (typeof $request !== "undefined") {
  const headers = $request.headers;
  $prefs.setValueForKey(JSON.stringify(headers), KEY);
  $notify("同程旅行", "✅ Token 已获取", "");
  $done({}); // 让请求正常通过
}

// ========= 如果是定时任务触发 =========
if (typeof $task !== "undefined") {
  (async () => {
    const raw = $prefs.valueForKey(KEY);
    if (!raw) {
      $notify("同程旅行", "❌ 尚未获取 Token", "请先打开App抓取请求头");
      return;
    }
    const headers = JSON.parse(raw);
    try {
      const resp = await $task.fetch({
        url: `${BASE_URL}/index/sign`,
        method: "POST",
        headers: headers,
        body: JSON.stringify({ type: 1, day: todayStr() }),
        timeout: 30
      });
      const body = JSON.parse(resp.body);
      if (body.code === 200) {
        $notify("同程旅行签到成功", "🎉 已签到", body.data?.rewardDesc || "积分奖励");
      } else {
        $notify("同程旅行签到失败", `⚠️ ${body.msg || "未知错误"}`, "");
      }
    } catch (e) {
      $notify("同程旅行", "❌ 脚本错误", e.message);
    }
    $done();
  })();
}

/************************
 * 同程旅行签到 (Egern 专用版)
 * 功能：捕获请求头 → 每日签到
 ************************/
const KEY = "tongcheng_sign_header";
const BASE_URL = "https://app.17u.cn/welfarecenter";

function todayStr() {
  const d = new Date();
  const pad = n => (n < 10 ? "0" + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 将 headers 对象转为简单对象以便存储
function headersToObject(headers) {
  const obj = {};
  if (!headers) return obj;
  // 使用 Egern 官方 Headers API: headers.getAll()
  const allKeys = ['Host', 'User-Agent', 'Content-Type', 'Cookie', 'token', 'location'];
  allKeys.forEach(key => {
    const val = headers.get(key);
    if (val) obj[key] = val;
  });
  return obj;
}

export default async function(ctx) {
  // --- 触发类型1: HTTP请求(捕获Token) ---
  if (ctx.request) {
    const headersObj = headersToObject(ctx.request.headers);
    try {
      // 使用 Egern 官方存储 API: ctx.storage
      await ctx.storage.set(KEY, JSON.stringify(headersObj));
      // 使用 Egern 官方通知 API: ctx.notify
      ctx.notify({
        title: "同程旅行",
        body: "✅ Token 已成功获取并存储",
      });
    } catch (e) {
      ctx.notify({
        title: "同程旅行",
        body: `❌ Token获取失败: ${e.message}`,
      });
    }
    return;
  }

  // --- 触发类型2: 定时任务(执行签到) ---
  try {
    const raw = await ctx.storage.get(KEY);
    if (!raw) {
      ctx.notify({
        title: "同程旅行",
        body: "❌ 尚未获取Token，请先打开App抓取请求头"
      });
      return;
    }

    const headers = JSON.parse(raw);
    const resp = await ctx.http.post({
      url: `${BASE_URL}/index/sign`,
      headers: headers,
      body: JSON.stringify({ type: 1, day: todayStr() }),
      timeout: 30
    });

    const body = await resp.json();
    if (body.code === 200) {
      ctx.notify({
        title: "同程旅行签到成功",
        body: `🎉 ${body.data?.rewardDesc || "已签到"}`
      });
    } else {
      ctx.notify({
        title: "同程旅行签到失败",
        body: `⚠️ ${body.msg || "未知错误"}`
      });
    }
  } catch (e) {
    ctx.notify({
      title: "同程旅行",
      body: `❌ 脚本错误: ${e.message}`
    });
  }
}

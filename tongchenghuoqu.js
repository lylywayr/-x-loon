export default async function(ctx) {
    console.log("同程-获取凭证 脚本已启动");

    const KEY_SIGNHEADER = "tongcheng_trip_signheader";

    try {
        const request = ctx.request;
        if (!request) {
            console.log("未获取到请求上下文，跳过执行");
            return;
        }

        const url = request.url || "";
        const method = request.method || "";
        const headers = request.headers || {};

        console.log("拦截到请求: " + method + " " + url);

        const isTargetUrl = url.includes("/welfarecenter/index/signIndex");
        const isNotOptions = method.toUpperCase() !== "OPTIONS";

        if (isTargetUrl && isNotOptions) {
            const headersJson = JSON.stringify(headers);
            ctx.storage.set(KEY_SIGNHEADER, headersJson);
            console.log("Cookie 存储成功");

            ctx.notify({
                title: "同程旅行",
                body: "凭证获取成功！\n已抓取账户信息，脚本将准时签到。"
            });
        } else {
            console.log("非目标请求: method=" + method + ", url=" + url);
        }
    } catch (error) {
        console.log("脚本执行出错: " + error);
        try {
            ctx.notify({
                title: "同程旅行",
                body: "凭证获取失败，请检查脚本。"
            });
        } catch (notifyError) {
            console.log("通知发送失败: " + notifyError);
        }
    }
}
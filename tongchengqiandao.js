export default async function(ctx) {
    const BASE_URL = "https://app.17u.cn/welfarecenter";
    const KEY_SIGNHEADER = "tongcheng_trip_signheader";
    const PHONE = "当前账号";

    let accountResult = "";
    let signSuccess = false;
    let tokenInvalid = false;

    function getTodayDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
    }

    async function postApi(path, body, headers) {
        const url = path.startsWith("http") ? path : BASE_URL + path;
        try {
            const resp = await ctx.http.post(url, {
                headers: headers,
                body: JSON.stringify(body || {}),
                timeout: 15000
            });
            const data = await resp.json();
            console.log("API 响应 (" + url + "): " + JSON.stringify(data));
            return data;
        } catch (e) {
            console.log("API 请求失败: " + url + " -> " + e);
            return null;
        }
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function runSignIn() {
        accountResult = "";
        signSuccess = false;
        tokenInvalid = false;

        const signheaderVal = ctx.storage.get(KEY_SIGNHEADER);
        if (!signheaderVal) {
            console.log("未获取到 Cookie，请先通过 MiTM 获取");
            ctx.notify({
                title: "同程旅行",
                body: "请先配置抓包脚本，在 APP 领福利页点击签到以获取 Cookie"
            });
            return;
        }

        let headers;
        try {
            headers = JSON.parse(signheaderVal);
        } catch (e) {
            console.log("Cookie 解析失败");
            ctx.notify({
                title: "同程旅行",
                body: "Cookie 格式错误，请重新获取"
            });
            return;
        }

        const signIndexRes = await postApi("/index/signIndex", {}, headers);
        if (!signIndexRes || signIndexRes.code !== 2200) {
            console.log("Token 失效了，请重新获取");
            tokenInvalid = true;
            ctx.notify({
                title: "同程旅行签到结果",
                body: "Token 失效，请重新抓包获取"
            });
            return;
        }

        const todaySign = signIndexRes.data?.todaySign;
        const mileage = signIndexRes.data?.mileageBalance?.mileage ?? 0;
        console.log("今日" + (todaySign ? "已" : "未") + "签到，当前剩余里程 " + mileage);

        if (!todaySign) {
            console.log("开始执行签到");
            const signRes = await postApi("/index/sign", { type: 1, day: getTodayDate() }, headers);
            if (signRes && signRes.code === 2200) {
                console.log("签到成功！");
                signSuccess = true;
            } else {
                console.log("签到失败！" + (signRes?.message || "未知错误"));
            }
        } else {
            console.log("今日已签到，开始获取任务列表");
            signSuccess = true;
        }

        const taskListRes = await postApi("/task/taskList?version=11.0.7", {}, headers);
        if (taskListRes && taskListRes.code === 2200 && Array.isArray(taskListRes.data)) {
            const tasks = taskListRes.data.filter(function(t) { return t.state === 1 && t.browserTime !== 0; });
            for (const task of tasks) {
                const taskCode = task.taskCode;
                const title = task.title;
                const browserTime = task.browserTime;
                console.log("开始做任务[" + title + "]，需要浏览 " + browserTime + " 秒");

                const startRes = await postApi("/task/start", { taskCode: taskCode }, headers);
                if (startRes && startRes.code === 2200 && startRes.data) {
                    const taskId = startRes.data;
                    await wait(browserTime * 1000);

                    let finishOk = false;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const finishRes = await postApi("/task/finish", { id: taskId }, headers);
                        if (finishRes && finishRes.code === 2200) {
                            console.log("完成任务[" + taskId + "]成功！开始领取奖励");
                            finishOk = true;
                            break;
                        }
                        if (attempt < 2) {
                            console.log("完成任务[" + taskId + "]失败，第 " + (attempt + 1) + " 次重试...");
                            await wait(2000 * (attempt + 1));
                        }
                    }

                    if (finishOk) {
                        await postApi("/task/receive", { id: taskId }, headers);
                        console.log("领取任务[" + title + "]奖励成功！");
                    }
                }
            }
        }

        const mileageRes = await postApi("/index/signIndex", {}, headers);
        if (mileageRes && mileageRes.code === 2200 && mileageRes.data) {
            const d = mileageRes.data;
            const cycleSignNum = d.cycleSighNum;
            const mileage2 = d.mileageBalance?.mileage ?? 0;
            const todayMileage = d.mileageBalance?.todayMileage ?? 0;
            console.log("本月签到 " + cycleSignNum + " 天，今日共获取 " + todayMileage + " 里程，当前剩余里程 " + mileage2);

            const statusIcon = signSuccess ? "签到成功" : "签到失败";
            const resultText = signSuccess ?
                statusIcon + "，本月签到[" + cycleSignNum + "]天" :
                statusIcon + "，请前往 APP 手动签到！\n本月签到[" + cycleSignNum + "]天";
            accountResult = "账号：" + PHONE + "\n" + resultText + "\n当前里程: [" + mileage2 + "](+" + todayMileage + ")\n\n";
        } else {
            accountResult = "账号：" + PHONE + "\n";
            if (signSuccess) accountResult += "签到成功（但获取里程信息失败）\n\n";
            else accountResult += "签到失败且获取里程信息失败\n\n";
        }

        let title = "同程旅行签到结果\n";
        if (tokenInvalid) title += " Token 失效";

        ctx.notify({ title: title, body: accountResult.trim() });
    }

    await runSignIn();
}
// TongCheng Daily Script for Egern
// 用于 Egern 模块: 同程旅行签到 - 每日完整任务

/********************* Egern 适配层 *********************/
// 创建一个兼容对象，让原脚本的 API 在 Egern 中正常工作
const $ = {};

// 基础配置
$.name = '同程旅行';
$.baseUrl = 'https://app.17u.cn/welfarecenter';
$.key = 'tongcheng_trip_signheader';
$.accountResult = '';
$.signSuccess = false;
$.tokenInvalid = false;

// 1. 存储操作适配
$.getdata = (key) => {
    try {
        return $prefs.valueForKey(key) || '';
    } catch (e) {
        console.log(`[${$.name}] 读取存储失败: ${e}`);
        return '';
    }
};
$.setdata = (value, key) => {
    try {
        return $prefs.setValueForKey(value, key);
    } catch (e) {
        console.log(`[${$.name}] 写入存储失败: ${e}`);
        return false;
    }
};

// 2. 日志适配
$.log = (message) => {
    console.log(`[${$.name}] ${message}`);
};

// 3. 通知适配
$.msg = (title, subtitle, body) => {
    $push.schedule({
        title: title,
        body: subtitle ? subtitle + '\n' + body : body,
    });
};

// 4. 网络请求核心适配
$.post = async (options, callback) => {
    try {
        const response = await $httpClient.post({
            url: options.url,
            headers: options.headers,
            body: options.body,
            timeout: 15 // 设置 15 秒超时
        });
        // 模拟原脚本的回调形式
        callback(null, response, response.body);
    } catch (error) {
        console.log(`[${$.name}] 网络请求失败: ${options.url} ${error}`);
        callback(error, null, null);
    }
};

// 5. 等待适配 (用于任务延时)
$.wait = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

// 6. 时间工具适配
$.time = (format) => {
    const now = new Date();
    if (format === 'yyyy-MM-dd') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return now.toISOString();
};

/********************* 原脚本核心逻辑 *********************/
// 此部分完整保留了 chavyleung/scripts 的功能实现

const BASE_URL = $.baseUrl;
const KEY_SIGNHEADER = $.key;

// 获取今天的日期字符串
function getTodayDate() {
    return $.time('yyyy-MM-dd');
}

// 发起 POST 请求的通用方法
function postApi(path, body, headers) {
    return new Promise((resolve) => {
        const opts = {
            url: path.startsWith('http') ? path : BASE_URL + path,
            headers: { ...headers, 'content-type': 'application/json' },
            body: typeof body === 'object' ? JSON.stringify(body || {}) : body || '{}'
        };
        $.post(opts, (err, resp, data) => {
            try {
                resolve(data ? JSON.parse(data) : null);
            } catch (e) {
                $.log('解析响应失败: ' + e + ', data: ' + data);
                resolve(null);
            }
        });
    });
}

// 主签到/任务流程 (与原脚本完全一致)
async function runSignIn() {
    $.accountResult = '';
    $.signSuccess = false;
    $.tokenInvalid = false;

    // 1. 检查并加载 Cookie
    const signheaderVal = $.getdata(KEY_SIGNHEADER);
    if (!signheaderVal) {
        $.log('未获取到 Cookie，请先通过 MiTM 获取：在 APP 打开「领福利」→ 点击签到');
        $.msg($.name, '', '请先配置抓包脚本，在 APP 领福利页点击签到以获取 Cookie');
        return;
    }

    try {
        $.headers = JSON.parse(signheaderVal);
        $.phone = $.headers.phone || $.headers.Phone || '当前账号';
    } catch (e) {
        $.log('Cookie 解析失败，请重新获取');
        $.msg($.name, '', 'Cookie 格式错误，请重新在 APP 领福利页点击签到以获取');
        return;
    }

    // 2. 查询签到状态
    const signIndexRes = await postApi('/index/signIndex', {}, $.headers);
    if (!signIndexRes || signIndexRes.code !== 2200) {
        $.log(`用户〖${$.phone}〗 - token 失效了，请重新在 APP 领福利页点击签到以更新`);
        $.tokenInvalid = true;
        $.accountResult = ` 账号：${$.phone}\n❌ token 失效，请重新抓包获取\n\n`;
        $.msg('✈️ 同程旅行签到结果\n⚠️ Token 失效', '', $.accountResult);
        return;
    }

    // 3. 执行每日签到 (如果未签)
    const todaySign = signIndexRes.data?.todaySign;
    const mileage = signIndexRes.data?.mileageBalance?.mileage ?? 0;
    $.log(`用户〖${$.phone}〗 - 今日${todaySign ? '已' : '未'}签到，当前剩余里程 ${mileage}！`);

    if (!todaySign) {
        $.log(`用户〖${$.phone}〗 - 今日未签到，开始执行签到`);
        const signRes = await postApi('/index/sign', { type: 1, day: getTodayDate() }, $.headers);
        if (signRes && signRes.code === 2200) {
            $.log(`用户〖${$.phone}〗 - 签到成功！`);
            $.signSuccess = true;
        } else {
            $.log(`用户〖${$.phone}〗 - 签到失败！${signRes?.message || '未知错误'}`);
        }
    } else {
        $.log(`用户〖${$.phone}〗 - 今日已签到，开始获取任务列表`);
        $.signSuccess = true;
    }

    // 4. 获取并执行浏览任务 (原脚本完整逻辑)
    const taskListRes = await postApi('/task/taskList?version=11.0.7', {}, $.headers);
    if (taskListRes && taskListRes.code === 2200 && Array.isArray(taskListRes.data)) {
        // 过滤出可执行的任务 (state === 1 且浏览时间不为 0)
        const tasks = taskListRes.data.filter((t) => t.state === 1 && t.browserTime !== 0);
        for (const task of tasks) {
            const { taskCode, title, browserTime } = task;
            $.log(`用户〖${$.phone}〗 - 开始做任务〖${title}〗，需要浏览 ${browserTime} 秒`);

            // 开始任务
            const startRes = await postApi('/task/start', { taskCode }, $.headers);
            if (startRes && startRes.code === 2200 && startRes.data) {
                const taskId = startRes.data;

                // 模拟浏览
                await $.wait(browserTime * 1000);

                // 完成任务 (带重试机制)
                let finishOk = false;
                for (let attempt = 0; attempt < 3; attempt++) {
                    const finishRes = await postApi('/task/finish', { id: taskId }, $.headers);
                    if (finishRes && finishRes.code === 2200) {
                        $.log(`用户〖${$.phone}〗 - 完成任务〖${taskId}〗成功！开始领取奖励`);
                        finishOk = true;
                        break;
                    }
                    if (attempt < 2) {
                        $.log(`用户〖${$.phone}〗 - 完成任务〖${taskId}〗失败，第 ${attempt + 1} 次重试...`);
                        await $.wait(2000 * (attempt + 1)); // 递增重试间隔
                    }
                }

                if (finishOk) {
                    await postApi('/task/receive', { id: taskId }, $.headers);
                    $.log(`用户〖${$.phone}〗 - 领取任务〖${title}〗奖励成功！`);
                }
            }
        }
    }

    // 5. 最终状态查询
    const mileageRes = await postApi('/index/signIndex', {}, $.headers);
    if (mileageRes && mileageRes.code === 2200 && mileageRes.data) {
        const d = mileageRes.data;
        const cycleSignNum = d.cycleSighNum;
        const mileage2 = d.mileageBalance?.mileage ?? 0;
        const todayMileage = d.mileageBalance?.todayMileage ?? 0;
        $.log(`用户〖${$.phone}〗 - 本月签到 ${cycleSignNum} 天，今日共获取 ${todayMileage} 里程，当前剩余里程 ${mileage2}`);

        const statusIcon = $.signSuccess ? '✨️' : '❗️';
        const resultText = $.signSuccess ?
            `${statusIcon} 签到成功，本月签到〖${cycleSignNum}〗天` :
            `${statusIcon} 签到暂不可用，请前往 APP 手动签到！\n️ 本月签到〖${cycleSignNum}〗天`;
        $.accountResult = ` 账号：${$.phone}\n${resultText}\n 当前里程: 〖${mileage2}〗(+${todayMileage})\n\n`;
    } else {
        $.accountResult = ` 账号：${$.phone}\n`;
        if ($.signSuccess) $.accountResult += '✅ 签到成功（但获取里程信息失败）\n\n';
        else $.accountResult += '❌ 签到失败且获取里程信息失败\n\n';
    }

    let title = '✈️ 同程旅行签到结果\n';
    if ($.tokenInvalid) title += ' ⚠️ Token 失效';
    
    $.msg(title, '', $.accountResult.trim());
}

// 启动主流程
!(async () => {
    await runSignIn();
    // 在 Egern 中，schedule 脚本不需要显式调用 $done，但为兼容也可以调用
})();
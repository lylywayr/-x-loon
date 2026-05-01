// TongCheng Capture Script for Egern
// 用于 Egern 模块: 同程旅行签到

// 创建运行环境适配对象，使原脚本的 API 能在 Egern 中工作
const $ = {
    // 存储操作：映射到 Egern 的持久化存储
    getdata: (key) => {
        // 读取 $prefs 中的值
        return $prefs.valueForKey(key) || '';
    },
    setdata: (value, key) => {
        // 写入 $prefs
        return $prefs.setValueForKey(value, key);
    },
    // 日志输出
    log: (message) => {
        console.log(message);
    },
    // 通知系统：映射到 Egern 的本地通知
    msg: (title, subtitle, body) => {
        $push.schedule({
            title: title,
            body: subtitle ? subtitle + '\n' + body : body,
        });
    },
    // 脚本结束时的清理工作
    done: () => {
        // 在 Egern 的 http_request 脚本中，$done() 用于指示脚本执行完毕
        if (typeof $done === 'function') {
            $done();
        }
    }
};

// 将请求信息转化为脚本可用的全局变量
const $request = {
    url: $context.request.url, // 从 Egern 上下文获取请求 URL
    headers: $context.request.headers, // 获取请求头
    method: $context.request.method    // 获取请求方法
};

// 原脚本的核心逻辑 --- 开始 ---
// 这部分代码完全保留了 chavyleung 原脚本中用于捕获 Cookie 的逻辑

const KEY_SIGNHEADER = 'tongcheng_trip_signheader';

// 检查是否为 MiTM 请求且不是 OPTIONS 方法
const isMitmRequest = typeof $request !== 'undefined' && $request && typeof $request.url === 'string' && /\/welfarecenter\/index\/signIndex/.test($request.url) && $request.headers;

if (isMitmRequest) {
    if ($request.method !== 'OPTIONS') {
        // 将请求头保存到持久化存储
        $.setdata(JSON.stringify($request.headers), KEY_SIGNHEADER);
        $.msg('同程旅行', '获取同程旅行账户成功', '请运行签到脚本');
        console.log('同程旅行 Cookie 捕获成功，已存储。');
        $.done();
    } else {
        $.log('获取同程旅行账户失败');
        $.done();
    }
} else {
    // 非 MiTM 请求，什么都不做
    $.log('未检测到目标请求，跳过 Cookie 捕获。');
    $.done();
}

// 原脚本的核心逻辑 --- 结束 ---
// console.log("Ajax proxy document.js");

import lib from "@proxy/lib";
import { NoticeFrom, NoticeTo, NoticeKey, StorageKey } from "@proxy/shared-utils";
import { NOTICE_KEY_REFRESH_GLOBAL_STATE } from "./consts";

window.addEventListener(
    "message",
    function (event) {
        const data = event.data;
        let globalSwitch = false
        if (data.from === NoticeFrom.CONTENT && data.to === NoticeTo.DOCUMENT) {
            switch (data.key) {
                // 更新全部数据
                // content 首次加载时
                case NOTICE_KEY_REFRESH_GLOBAL_STATE:
                    const {
                        GLOBAL_SWITCH,
                        MODE,
                        INTERCEPT_LIST,
                        REDIRECT_LIST,
                    } = StorageKey
                    // 获取 映射
                    // 设置默认值
                    const {
                        [GLOBAL_SWITCH]: global_on = false,
                        [MODE]: mode = 'interceptor',
                        [INTERCEPT_LIST]: interceptor_matching_content = [],
                        [REDIRECT_LIST]: redirector_matching_content = [],
                    } = data.value || {}
                    lib.update({ global_on, mode, interceptor_matching_content, redirector_matching_content })
                    break;
                // 全局开关
                case NoticeKey.GLOBAL_SWITCH:
                    globalSwitch = data.value;
                    lib.update(globalSwitch)
                    break;
                // 模式切换
                case NoticeKey.MODE:
                    lib.update(data.value)
                    break;
                // 拦截器列表
                case NoticeKey.INTERCEPT_LIST:
                    lib.update(data.value)
                    break;
                // 重定向列表
                case NoticeKey.REDIRECT_LIST:
                    lib.update(data.value)
                    break;
            }
        }
    },
    false
);

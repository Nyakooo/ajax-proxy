
let current_window_id: number | undefined

/**获取所有windowId */
async function getAllWindowIds(): Promise<(number | undefined)[]> {
    return new Promise((resolve) => {
        chrome.windows.getAll(function (targets) {
            const ids = targets.map((item) => item.id);
            resolve(ids);
        });
    });
}

/**创建视图 */
export async function createPanel() {
    const _createFunc = function () {
        // https://developer.chrome.com/docs/extensions/reference/windows/
        chrome.windows.create(
            {
                url: "panels/index.html",
                type: "popup",
                width: 1300,
                height: 750,
                top: 30,
                left: 150,
            },
            function (target) {
                // bugfix: id undefined 问题
                if (target) current_window_id = target.id
            }
        );
    };
    if (!current_window_id) {
        _createFunc();
    } else {
        // 获取所有窗口id，判断cacheId是否存在
        // 如果已经存在则置前
        const ids = await getAllWindowIds();
        const exist = ids.some((item) => item === current_window_id);
        if (exist) {
            chrome.windows.update(current_window_id, { focused: true });
            return;
        }
        // 不存在，则重新创建，刷新cacheId
        _createFunc();
    }
}

/**关闭视图 */
export async function closePanel() {
    if (current_window_id) {
        chrome.windows.remove(current_window_id);
        current_window_id = undefined
    }
}

/**全屏 */
export async function fullScreenPanel() {
    if (current_window_id) {
        chrome.windows.getCurrent(function (current) {
            if (current.id && current.id === current_window_id) {
                switch (current.state) {
                    case "fullscreen":
                        chrome.windows.update(current.id, { state: "normal" });
                        break;
                    default:
                        chrome.windows.update(current.id, { state: "fullscreen" });
                        break;
                }
            }
        });
    }
}

/**修改 panels 窗口大小 */
export async function resizeWindow() {
    if (current_window_id) {
        chrome.windows.getCurrent(function (current) {
            // normal", "minimized", "maximized", or "fullscreen"
            const conf = {
                normal: "maximized",
                maximized: "fullscreen",
                fullscreen: "normal",
            };
            if (current.id && current.state && current.id === current_window_id)
                chrome.windows.update(current.id, { state: conf[current.state] });
        });
    }
}
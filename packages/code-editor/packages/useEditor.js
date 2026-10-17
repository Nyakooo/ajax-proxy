import ace from "ace-builds";
import "ace-builds/webpack-resolver"; // 在 webpack 环境中使用必须要导入
// 根据自己的需求按需引入
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/theme-monokai"; // 主题
import "ace-builds/src-noconflict/mode-javascript"; // 语言模式
import "ace-builds/src-noconflict/snippets/javascript"; //代码提示

// https://ace.c9.io/#nav=howto
// 初始化
export function useInit(container, type) {
    // 初始化
    const target = ace.edit(container, {
        maxLines: 20, // 最大行数，超过会自动出现滚动条
        minLines: 20, // 最小行数，还未到最大行数时，编辑器会自动伸缩大小
        fontSize: 14, // 编辑器内字体大小
        theme: "ace/theme/monokai", // 主题
        mode: "ace/mode/javascript", // 默认设置的语言模式
        tabSize: 4, // 制表符设置为 4 个空格大小
    });
    target.setOptions({
        enableSnippets: true,
        enableLiveAutocompletion: true,
        enableBasicAutocompletion: true,
    });

    // 自定义提示
    customCompletions(target, type)

    return target;
}

// 自定义提示
function customCompletions(target, type = 'interceptor') {
    if (type === 'interceptor')
        target.completers.push({
            getCompletions: function (state, session, pos, prefix, callback) {
                if (prefix.length === 0) {
                    callback(null, []);
                    return;
                }
                callback(null, [
                    { meta: 'AjaxProxy::Ctx.req', caption: 'req.url: string', value: 'req.url', score: 100 },
                    { meta: 'AjaxProxy::Ctx.req', caption: 'req.method: string', value: 'req.method', score: 100 },
                    { meta: 'AjaxProxy::Ctx.req', caption: 'req.body?: any', value: 'req.body', score: 100 },
                    { meta: 'AjaxProxy::Ctx.res', caption: 'res.status: string', value: 'res.status', score: 100 },
                    { meta: 'AjaxProxy::Ctx.res', caption: 'res.customStatus: string', value: 'res.customStatus', score: 100 },
                    { meta: 'AjaxProxy::Ctx.res', caption: 'res.response: any', value: 'res.response', score: 100 },
                    {
                        meta: 'AjaxProxy::Next',
                        caption: 'next({ override?: string, status?: string | number })',
                        value: 'next({ override: "", status: "" });',
                        score: 100
                    },
                ]);
            },
        });
    else
        target.completers.push({
            getCompletions: function (state, session, pos, prefix, callback) {
                if (prefix.length === 0) {
                    callback(null, []);
                    return;
                }
                callback(null, [
                    { meta: 'AjaxProxy::Ctx.req', caption: 'req.url: string', value: 'req.url', score: 100 },
                    { meta: 'AjaxProxy::Ctx.req', caption: 'req.method: string', value: 'req.method', score: 100 },
                    {
                        meta: 'AjaxProxy::Next',
                        caption: 'next({ url: string, headers?: { [key: string]: string } })',
                        value: 'next({ url: req.url });',
                        score: 100
                    },
                ]);
            },
        });
}

// 默认内容
export function getDefaultContent(type = "interceptor") {
    let defaultContent = type === 'interceptor' ?
        `
/** @see https://github.com/g0ngjie/ajax-proxy/blob/master/README.func.md */
function setup(req, res, next) {
    // TODO...
    // type Next = { override?: string, status?: string | number }
    next({ override: "", status: "" });
}
` :
        `
/** @see https://github.com/g0ngjie/ajax-proxy/blob/master/README.func.md */
function setup(
    req, /** req: { url: string, method: string }*/
    next /**{ url: string, headers?: { [key: string]: string } }*/
) {
    // TODO...
    next({ url: "" });
}
`
    return defaultContent
}

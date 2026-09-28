> **版本提示：**本页仅描述 V2 的旧 `setup(req, res, next)` API，示例不适用于 V3。V3 自定义函数的能力和安全边界见 [V3 指南](docs/V3-USER-FUNCTIONS.zh.md)。
>
> **Version note:** This page describes Ajax Proxy V2's legacy API only. Its examples do not apply to V3. See the [V3 custom function guide](docs/V3-USER-FUNCTIONS.zh.md).

## V2 函数式重定向（旧能力）

下面的函数表达式可用于 V2 重定向规则的函数模式。扩展会先按规则的 method 条件过滤，再把请求 URL 和 method 传给函数；函数代码需要自行检查 URL 并决定目标地址。函数模式不会自动使用规则的 `domain` / regex 条件来筛选请求。返回值可以是 `{ url, headers? }`，也可以通过第二个参数 `next({ url, headers? })` 完成；Promise 返回值同样支持。

```js
function redirect(req) {
  if (req.method === 'GET' && req.url.includes('/api/profile')) {
    return Promise.resolve({
      url: req.url.replace('/api/profile', '/mock/profile'),
      headers: { 'x-ajax-proxy': 'v2-function' },
    })
  }

  return { url: req.url }
}
```

此功能通过 V2 的 `window.eval()` 在网页主世界运行，只能使用你信任的代码。函数抛错、拒绝、返回无效结果或超时会按 fail-open 继续原请求；同步死循环会阻塞页面线程，超时无法中断它。函数式重定向尚未迁移到 V3；V3 规则使用独立 schema 和受限 sandbox 函数响应能力。

## 函数式响应

**函数式响应**面向特殊需求。本质上也是通过代码片段方式注入到浏览器中，相比固定格式它可以更灵活，支持 Promise。你甚至可以直接在函数体内使用**XHR/Fetch**去发起独立请求。但需要注意的是，所有逻辑只能写在**setup**函数中。

![diagram](/media/diagram.png)

### 参数定义

#### req

请求参数

```ts
type Req = {
  url: string;
  method: string;
  body?: any;
};
```

#### res

响应参数

```ts
type Res = {
  status: string; // 系统响应状态码
  customStatus: string; // 自定义状态码
  response: any;
};
```

#### next

```ts
type Next = {
  override?: string;
  status?: string | number;
};
```

### 示例一

```js
function setup(req, res, next) {
  const RoleType = {
    ADMIN: 1,
    NORMAL: 2,
  };

  let override;
  // 需要区分XHR于Fetch请求对应不同数据格式的response
  const json = JSON.parse(res.response);
  if (json.user.roleType === RoleType.NORMAL) {
    json.user.roleType = RoleType.ADMIN;
    override = json;
  }

  next({ override });
}
```

### 示例二

```js
async function setup(req, res, next) {
  let override;
  if (res.status !== 200) {
    // 独立接口请求
    const res = await fetch("https://v1.hitokoto.cn/");
    const json = await res.json();
    override = {
      code: 100,
      data: json,
    };
    // 日志输出
    console.log("override:", override);
  } else override = res.response;

  next({
    // 如果不传override，则返回""
    override,
    // 如果不传status，则返回customStatus
    status: 200,
  });
}
```

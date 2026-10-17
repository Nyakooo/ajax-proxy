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

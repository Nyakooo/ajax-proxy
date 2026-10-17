# Ajax Proxy Privacy Policy

Public policy pages:

- Current link: <https://nyakooo.github.io/ajax-proxy/privacy/>
- Versioned link: <https://nyakooo.github.io/ajax-proxy/privacy/classic-3.1.0/>

**Last updated: October 17, 2026**

This policy describes the classic Ajax Proxy extension currently listed as version 3.1.0 in the Chrome Web Store.

## Information the extension handles

The extension can read the current page title to associate its separate control panel with the active page. When the global switch is on, it processes the URL and method of XMLHttpRequest (XHR) and Fetch requests to match rules configured by the user. When a matching response rule is enabled, the extension may also process the request body, response status, and response data so it can apply the configured replacement. Redirect rules can change a matching request's destination and add headers configured by the user.

This information can include web browsing activity or website content, and may contain sensitive information. The extension handles it in the browser to provide the response modification and redirection features the user selected.

The extension stores user-created rules and settings in local browser storage. These may include URL patterns, request methods, replacement response data, redirect destinations and headers, user-provided function code, preferences, and rule hit counts. The extension does not send this stored information to a developer-operated server. Settings remain on the device until the user removes them or uninstalls the extension. A backup file contains the configuration the user chooses to export and is saved wherever the user selects.

## Custom functions

Custom functions are code supplied by the user. The extension runs them locally in the target page's JavaScript context to apply the configured rule; they are not run in an isolated sandbox. A response function receives the request and response context made available by the feature, including the request URL, method, body, response status, and response data. A redirect function receives the request URL and method. Because custom functions run in the page context, their access to page data and their behavior depend on the code the user enters. A custom function may also make network requests using APIs available to the page. Review custom code before enabling it.

## How information is used and shared

Ajax Proxy's built-in code uses request information only to match and apply the user's enabled rules, update local rule hit counts, and show the result in the extension interface. It does not send request or response data, page titles, rules, settings, or usage analytics to the developer or to an Ajax Proxy-operated server. It does not sell this information or use it for advertising.

Websites receive the requests that their pages initiate. When a redirect rule is enabled, the browser sends the request to the destination selected by that rule instead. These destinations are chosen by the website or the user's configuration, not by an Ajax Proxy-operated service. Any additional network activity from a user-provided function depends on that function's code.

Our use and transfer of web browsing activity and website content is limited to providing the extension's disclosed user-facing purpose: modifying configured XHR and Fetch responses and redirecting configured requests. We do not sell this data, use it for advertising, or allow the developer to read it. Our use of user data follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

## User control and deletion

The extension applies request rules while its global switch is enabled. Users can turn the switch off, disable or delete individual rules in the panel, or remove the extension. Removing the extension may also remove its locally stored data. Users can export rules with the backup feature; exported files are under the user's control.

## Contact

For questions or privacy requests, open an issue at <https://github.com/Nyakooo/ajax-proxy/issues>.

---

# Ajax Proxy 隐私权政策

**最后更新：2026 年 10 月 17 日**

本政策说明当前在 Chrome 应用商店标示为 3.1.0 的 Ajax Proxy 经典版扩展如何处理信息。

## 扩展会处理的信息

扩展可以读取当前网页标题，用于让独立操作面板显示其对应的页面。总开关开启后，扩展会处理 XMLHttpRequest（XHR）和 Fetch 请求的 URL 与方法，以匹配用户配置的规则。启用的响应规则命中时，扩展还可能处理请求正文、响应状态和响应数据，以应用用户配置的替换内容。重定向规则可以更改匹配请求的目标地址，并添加用户配置的请求标头。

这些信息可能包含浏览活动或网站内容，也可能包含敏感信息。扩展在浏览器本地处理这些信息，以提供用户所选的响应修改和请求重定向功能。

扩展会在浏览器本地保存用户创建的规则和设置，其中可能包括 URL 匹配条件、请求方法、替换响应数据、重定向目标及请求标头、用户编写的函数代码、偏好设置和规则命中次数。扩展不会将这些已保存的信息发送到开发者运营的服务器。设置会保留在用户设备上，直到用户删除这些设置或卸载扩展。用户选择导出的备份文件包含所选配置，并保存到用户指定的位置。

## 自定义函数

自定义函数是用户提供的代码。扩展会在目标网页的 JavaScript 上下文中本地运行这些函数，以应用配置的规则；它们并非在隔离沙箱中运行。响应函数会收到该功能提供的请求和响应上下文，包括请求 URL、方法、正文、响应状态和响应数据。重定向函数会收到请求 URL 和方法。由于自定义函数运行在网页上下文中，它能访问哪些网页数据、会执行什么操作，取决于用户输入的代码。自定义函数也可以使用网页提供的 API 发起网络请求。启用前请检查自定义代码。

## 信息的用途与共享

Ajax Proxy 自身的代码仅使用请求信息来匹配并应用用户启用的规则、更新本地规则命中次数，并在扩展界面显示结果。它不会将请求或响应数据、网页标题、规则、设置或使用分析数据发送给开发者或 Ajax Proxy 运营的服务器；不会出售这些信息，也不会将其用于广告。

网页会接收其发起的请求。启用重定向规则时，浏览器会改为向该规则指定的目标地址发送请求。这些目标由网页或用户自己的配置决定，并非由 Ajax Proxy 服务指定。用户编写的函数产生的其他网络活动取决于该函数代码。

我们对浏览活动和网站内容的使用与传输，仅限于提供扩展已披露的用户功能：修改用户配置的 XHR 和 Fetch 响应，以及重定向用户配置的请求。我们不会出售这些数据、将其用于广告，也不会允许开发者读取这些数据。我们对用户数据的使用遵循 Chrome 应用商店用户数据政策，包括其中的有限使用要求。

## 用户控制与删除

总开关开启时，扩展才会应用请求规则。用户可以关闭总开关、在面板中停用或删除单条规则，或卸载扩展。卸载扩展时，本地保存的数据也可能被移除。用户可以通过备份功能导出规则；导出文件由用户自行管理。

## 联系方式

如有隐私相关问题或请求，请通过 <https://github.com/Nyakooo/ajax-proxy/issues> 联系项目维护者。

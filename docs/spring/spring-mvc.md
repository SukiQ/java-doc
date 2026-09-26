---
title: Spring MVC
---

# Spring MVC


## Spring MVC 的架构？

<img src="/pictures/13.png" alt="13" style="zoom:50%;" />

MVC（Model-View-Controller）是一种常见的软件设计模式，用于将应用程序的逻辑分离成三个独立的组件：

- 模型（Model）：模型是应用程序的数据和业务逻辑的表示。它负责处理数据的读取、存储和操作，以及业务规则的处理。模型通常是独立于用户界面的，可以在不同的视图和控制器之间共享和重用。
- 视图（View）：视图是用户界面的呈现部分，负责展示数据给用户，并接收用户的输入。视图通常是根据模型的数据进行渲染和更新的，它可以是Web页面、图形界面或命令行界面等。
- 控制器（Controller）：控制器是模型和视图之间的协调者，负责接收用户的输入并根据输入调用相应的模型逻辑。控制器将用户的请求转发给模型进行处理，并将处理结果传递给视图进行展示。控制器还可以处理视图的事件和状态变化。
  



## Spring MVC 的处理流程？

### <img src="/pictures/14.png" alt="14" style="zoom:50%;" />

1. 请求进入：请求先到 Servlet 容器（Tomcat），由 **DispatcherServlet**（前端控制器）统一接收——所有请求的唯一入口，`doDispatch` 主导全流程。

2. 查找 Handler：DispatcherServlet 拿着请求问 **HandlerMapping**（RequestMappingHandlerMapping 解析 @RequestMapping），得到 **HandlerExecutionChain**（目标 Handler + 该路径的拦截器链）；找不到匹配 → 直接 404。

3. 前置拦截：依次执行拦截器 **preHandle**；任何一个返回 false → 请求终止（已通过的拦截器补执行 afterCompletion）。

4. 执行 Handler：由 **HandlerAdapter** 适配调用 Controller 方法，调用前完成：

- 参数解析：@RequestParam、@PathVariable 从 URL 取
- 报文反序列化：@RequestBody 经 **HttpMessageConverter**（Jackson）转对象
- 数据绑定与校验：Bean Wrapper 填充 + JSR-303 校验

5. 处理返回值（两条路）：

- **前后端分离（主流）**：@ResponseBody → HttpMessageConverter 把返回对象序列化 JSON 直接写回响应流，无视图环节
- **传统页面**：返回逻辑视图名 + Model → **ViewResolver** 解析出 View → 渲染（模板合并数据）

6. 异常路径**：Handler 抛出的异常被 **HandlerExceptionResolver** 捕获（@ControllerAdvice 的 @ExceptionHandler），转成错误响应；都处理不了 → 交给容器错误页。

7. 收尾：拦截器 **postHandle**（响应写出前）→ 渲染/写回 → 拦截器 **afterCompletion**（无论成功异常都执行，用于清理）→ 响应返回客户端。



### 核心组件

| 组件 | 职责 |
|------|------|
| **DispatcherServlet** | 前端控制器，接收并分发请求（核心，其余都是它的协作者） |
| **HandlerMapping** | URL → Handler 的映射（RequestMappingHandlerMapping 解析 @RequestMapping） |
| **HandlerAdapter** | 适配调用 Handler（参数解析、数据绑定、返回值处理） |
| **HandlerInterceptor** | 拦截器：preHandle / postHandle / afterCompletion |
| **HandlerExceptionResolver** | 全局异常解析（@ControllerAdvice/@ExceptionHandler 的载体） |
| **ViewResolver / View** | 视图解析与渲染（传统页面） |
| **HttpMessageConverter** | JSON 等报文转换（@RequestBody/@ResponseBody） |

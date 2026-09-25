# 启动优化




## Spring Boot 启动速度如何优化？



### 先定位：启动慢在哪

- StartupEndpoint：给 SpringApplication 配置 Startup 步骤收集器，应用启动后通过 actuator 的 `/actuator/startup` 端点查看各阶段的耗时排序。

- Arthas trace：在线诊断不重启，`trace org.springframework.boot.SpringApplication run` 直接看 run 方法内部各环节耗时，再逐层下钻到具体 Bean。

- 开启 log-startup-info ，获取启动时长

### 常规优化

| 优化点 | 做法 |
|--------|------|
| **精简自动配置** | 按需引入 starter，排除无用依赖；`spring.autoconfigure.exclude` 排除不需要的自动配置 |
| **懒加载** | 使用 `@Lazy` |
| **减少扫描范围** | `@ComponentScan` 收窄包路径，避免扫到无关 jar |
| **异步初始化** | `@Async` 初始化非核心 Bean；`ApplicationRunner` 里的重活延后 |

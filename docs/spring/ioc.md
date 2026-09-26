---
title: IoC 容器
---

# IoC 容器




## Spring Bean 的循环依赖是怎么解决的？

### 解决方案：三级缓存

| 缓存 | 名称 | 存什么 |
|------|------|--------|
| 一级 | `singletonObjects` | **完整的**单例 Bean（初始化完毕） |
| 二级 | `earlySingletonObjects` | **早期的** Bean（实例化但未完成属性注入/初始化） |
| 三级 | `singletonFactories` | ObjectFactory **工厂**，调用后才产出早期引用 |



### 为什么需要三级而不是两级？

三级缓存存的是**工厂**而不是直接引用，目的是给 **AOP** 留口子

**注**：Spring Boot 2.6+ 默认**禁止循环依赖**（启动直接报错），鼓励消除循环；可用 `spring.main.allow-circular-references=true` 强行放开（不建议）




## BeanFactory 和 ApplicationContext 的区别？

BeanFactory 是 IoC 容器的**顶层接口**；ApplicationContext 是它的**子接口**，功能超集，日常用的就是它。

| 对比 | BeanFactory | ApplicationContext |
|------|-------------|---------------------|
| 定位 | 顶层基础接口，只提供核心 IoC（getBean） | 子接口，**BeanFactory + 企业级功能** |
| Bean 加载 | **懒加载**：getBean 时才创建 | **默认急加载**：容器启动时全部实例化（便于尽早发现配置错误） |
| 国际化 | ❌ | ✅ MessageSource |
| 事件发布 | ❌ | ✅ ApplicationEvent 发布订阅 |
| 资源访问 | ❌ | ✅ ResourceLoader（统一加载文件/URL/classpath） |
| 环境/Profile | ❌ | ✅ Environment（多环境配置） |
| AOP 支持 | 手动处理 | 自动代理（内部已集成） |
| 典型实现 | DefaultListableBeanFactory | AnnotationConfigApplicationContext、ClassPathXmlApplicationContext |




## Spring 的 Aware 和 Event 有什么区别？

两者都是 Bean **与容器交互的扩展点**，方向不同：Aware 是 **Bean 主动拿**容器的东西，Event 是 **容器主动通知** Bean 发生了什么。

| 对比 | Aware | Event（事件机制） |
|------|-------|-------------------|
| 方向 | **拉**：Bean 向容器要组件 | **推**：容器/发布者广播，监听者收 |
| 目的 | 获取容器内部对象（name、context、factory） | 解耦的业务/容器通知 |
| 使用方式 | 实现 `xxxAware` 接口，回调 `setXxx()` 注入 | 发布 `publishEvent` + `@EventListener` 监听 |
| 常见接口/事件 | BeanNameAware、BeanFactoryAware、**ApplicationContextAware** | ContextRefreshedEvent、自定义事件 |
| 触发时机 | Bean 生命周期**初始化前**（见生命周期题） | 事件发生的任意时刻 |
| 典型场景 | 工具类里拿 ApplicationContext 手动取 Bean | 业务解耦（下单后发通知）、启动完成后执行初始化逻辑 |

```java
// Aware：实现接口，容器回调注入
@Component
public class Holder implements ApplicationContextAware {
    @Override
    public void setApplicationContext(ApplicationContext ctx) { ... }
}

// Event：发布 + 监听
publisher.publishEvent(new OrderCreatedEvent(order));

@EventListener
public void onOrderCreated(OrderCreatedEvent e) { ... }
```

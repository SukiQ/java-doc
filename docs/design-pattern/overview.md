---
title: 总览
---

# 总览


## 有哪些设计模式？

23 种 GoF 模式，按目的分三类：**创建型（怎么建对象）、结构型（怎么组装）、行为型（怎么协作）**。



### 创建型

| 模式 | 意图 | 典型应用 |
|------|------|----------|
| **单例** | 全局唯一实例 | Spring Bean 默认作用域、Runtime |
| **工厂方法** | 子类决定创建哪个对象 | `Calendar.getInstance`、Logger |
| **抽象工厂** | 创建一族相关对象 | `Connection`（不同数据库一族实现） |
| **建造者** | 分步构建复杂对象 | `StringBuilder`、Lombok @Builder、OkHttp Request |
| **原型** | 克隆生成新对象 | `Object.clone`、浅/深拷贝 |



### 结构型

| 模式 | 意图 | 典型应用 |
|------|------|----------|
| **代理** | 控制对目标的访问 | **Spring AOP**（JDK 动态代理）、MyBatis Mapper 接口 |
| **适配器** | 接口转换 | `HandlerAdapter`、`InputStreamReader` |
| **装饰器** | 动态加功能不改类 | Java IO 流（BufferedReader 包 FileReader） |
| **外观** | 给子系统一个统一入口 | `JdbcTemplate`、Sl4j 门面 |
| **组合** | 树形部分-整体 | `Component`/`Container`、文件目录树 |
| **享元** | 共享细粒度对象 | Integer 缓存池（-128~127）、字符串常量池 |
| **桥接** | 抽象与实现分离 | JDBC（API 与驱动） |

- 适配器模式：对外暴露新接口，内部调用旧接口，完成参数/返回值/协议转换。（比如采集平台）
- 装饰器模式：**不修改原对象，通过“套一层”的方式给对象动态增加功能。**



### 行为型

| 模式 | 意图 | 典型应用 |
|------|------|----------|
| **策略** | 算法可替换 | `Comparator`、Spring 的 Resource 加载 |
| **模板方法** | 父类定骨架，子类填细节 | `JdbcTemplate`、AQS 的 tryAcquire、AbstractList |
| **观察者** | 状态变化通知订阅者 | Spring Event、Guava EventBus、MQ |
| **责任链** | 请求沿链传递处理 | **拦截器/过滤器链**、Netty Pipeline、OkHttp |
| **迭代器** | 顺序访问不暴露内部 | `Iterator`、foreach |
| **命令** | 请求封装成对象 | `Runnable`、线程池任务 |
| **状态** | 状态驱动行为变化 | 订单状态机 |
| **中介者** | 集中管理对象交互 | **MQ/注册中心**本质思想、MVC 的 C |
| **备忘录** | 保存/恢复状态 | **事务回滚**（undo log）、编辑器撤销 |
| **解释器** | 定义语法解释 | 正则、SpEL |

---
title: 分布式任务
---

# 分布式任务


## 定时任务有哪些实现方式？

### Java 层面（单机）

| 方式 | 原理 | 特点 |
|------|------|------|
| **Timer** | 单线程 + 任务队列 | 老旧，一个任务异常影响整个 Timer，已淘汰 |
| **ScheduledExecutorService** | 线程池调度（`scheduleAtFixedRate` / `withFixedDelay`） | 单机可靠方案；FixedRate 按起始时间、FixedDelay 按上次结束时间 |
| **Spring @Scheduled** | 基于 ScheduledExecutorService 封装 | 注解 + cron 表达式；默认单线程池，多任务会阻塞需配置 `TaskScheduler` 线程数 |
| **DelayQueue / 时间轮** | 延迟队列 | Netty HashedWheelTimer、Kafka Purgatory 用时间轮，海量定时任务 O(1) 触发 |

### 单机的固有问题 → 分布式定时任务

多实例部署时 @Scheduled 每台都执行（**重复执行**）→ 需要分布式调度。

### 分布式调度框架

| 框架 | 原理 | 特点 |
|------|------|------|
| **Quartz** | 集群模式靠**数据库行锁**（QRTZ_LOCKS）抢占触发 | 老牌、API 重、只保证不重复不保证不漏；大多数框架的内核 |
| **XXL-JOB** | 调度中心 + 执行器架构；中心负责触发，**执行器回调结果** | 国内最流行；路由策略（轮询/分片/故障转移）、失败重试、告警、Web 界面 |
| **Elastic-Job** | 基于 ZooKeeper 选举 + 分片（任务拆 N 片分给多实例） | 当当开源，去中心化；依赖 ZK，运维重 |
| **PowerJob** | 时间轮 + 无锁调度 | 新一代，支持工作流、秒级任务、Map/MapReduce 编程模型 |

### XXL-JOB 的分片任务（高频追问）

```
大任务拆片：参数 = 分片总数 + 当前分片序号
→ 每个实例只处理自己那片数据（如 100 万订单按 id % 分片数）
→ 水平扩展处理能力，实例间互不重复
```

### 选型

```
单机简单任务      → Spring @Scheduled（注意线程池配置）
分布式、可视化运维 → XXL-JOB（默认选择）
需要分片/工作流    → XXL-JOB 分片、PowerJob
ZK 生态已有       → Elastic-Job
```

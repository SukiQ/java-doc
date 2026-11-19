---
title: Kafka 高可用与运维
---

# Kafka 高可用与运维


## 副本机制与 ISR 是什么？

每个分区 1 个 **Leader** + N 个 **Follower**：读写都走 Leader，Follower 单向拉取同步。

| 概念 | 说明 |
|------|------|
| **ISR**（In-Sync Replicas） | 与 Leader 保持同步的副本集合（含 Leader）；落后超过 `replica.lag.time.max.ms`（默认 30s）被踢出 |
| OSR | 被踢出 ISR 的滞后副本；ISR + OSR = 全部副本 |
| **HW**（High Watermark 高水位） | 消费者能见到的最大 offset = **ISR 中最小的 LEO**；低于 HW 的消息才可见（保证不消费到可能丢的） |
| LEO（Log End Offset） | 每个副本日志的下一条写入位置 |

```
Leader:   [0 1 2 3 4 5]  LEO=6
Follower: [0 1 2 3 4]    LEO=5   →  HW=5（消费者最多读到 offset 4）
```

- Follower 只需跟上 ISR 即可被选为 Leader；数据差距在可接受时间内
- `replication.factor=3 + min.insync.replicas=2`：允许 1 台故障，不丢已确认消息

## Leader 选举与 Controller？

| 角色 | 职责 |
|------|------|
| **Controller** | 从 Broker 中选出的"总管"：分区 Leader 选举、元数据广播、故障转移；依赖 ZooKeeper（旧）/ KRaft（新） |
| Leader 挂了 | Controller 从 **ISR 里**选新 Leader（数据最全的优先），广播给各 Broker |

- `unclean.leader.election.enable=false`（默认）：禁止 OSR 副本当 Leader——**宁可不可用也不丢数据**（CP 取向）
- KRaft（2.8+ 试用、3.3+ 生产）：用 Raft 协议自管理元数据，**去掉 ZooKeeper**，控制器故障转移从秒级降到毫秒级

## 消息积压怎么处理？

先定位原因（消费能力不足 / 消费挂了 / 突发流量），再对症：

| 场景 | 处理 |
|------|------|
| 消费能力不足 | **加消费者**（上限 = 分区数）；批量消费、业务异步化、多线程处理（注意 offset 管理） |
| 分区数不够 | 新建大分区数的 topic → 临时消费者搬运，新消费者组消费新 topic |
| 消费逻辑慢 | 优化单条耗时（DB 批量写、下游 RPC 合并） |
| 垃圾/过期数据 | 按保留时间/大小清理（`retention.ms`），或跳过堆积位点重置 offset |
| 持续突发 | 评估分区扩容 + 下游限流 |

## Kafka 的三种消息语义？

| 语义 | 实现 |
|------|------|
| At most once（最多一次） | 先提交 offset 再处理，可能丢 |
| At least once（至少一次） | 先处理再提交 offset，可能重复（**最常用**，配幂等） |
| **Exactly once** | 幂等 producer（单分区）或事务（跨分区 + 消费位点），端到端限于 Kafka 内部 |

对外部系统（DB/ES）没有免费 exactly once，仍需业务幂等。

## Kafka 和 RocketMQ 怎么选？

| 对比 | Kafka | RocketMQ |
|------|-------|----------|
| 吞吐 | 单机百万级，**超大规模日志/埋点首选** | 十万级，足够多数业务 |
| 延迟 | 毫秒级 | 毫秒级 |
| 功能 | 精简：无延迟消息、无 Tag、无消息轨迹 | 延迟消息、事务消息、Tag/SQL 过滤、消息查询 |
| 顺序 | 分区有序 | 队列有序，语义相近 |
| 生态 | 大数据生态标配（Streams/Connect/Flink 对接） | 阿里系/电商业务常用 |
| 选型 | 日志、埋点、大数据管道 | 业务消息、交易事件、需要延迟/事务消息 |

详见 [RocketMQ 架构](/rocketmq/architecture)、[RocketMQ 可靠性](/rocketmq/reliability)。

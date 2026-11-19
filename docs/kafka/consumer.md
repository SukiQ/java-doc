---
title: Kafka 消费者
---

# Kafka 消费者


## Consumer 消费与 offset 管理的流程？

Consumer **主动拉取**（pull）：

| 步骤 | 说明 |
|------|------|
| 1. 加入组 | JoinGroup（找 Coordinator）→ 组内选出一个 Leader 消费者 |
| 2. 分配分区 | Leader 按分配策略定方案，SyncGroup 下发（消费者数 ≤ 分区数才有活干） |
| 3. 拉取消费 | `poll()` 按 offset 向 Leader 分区 fetch，可批量 |
| 4. 提交位点 | offset 写入内置 topic `__consumer_offsets`（默认 5s 自动提交） |

```java
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
    for (ConsumerRecord<String, String> r : records) {
        handle(r);                       // 业务处理
    }
    consumer.commitSync();               // 手动提交（处理后）
}
```

## offset 提交的几种方式？

| 方式 | 说明 | 风险 |
|------|------|------|
| 自动提交 `enable.auto.commit=true` | 每 5s 提交 poll 到的最新位点 | 处理未完成就提交 → **丢消息**；或重复消费 |
| 手动同步 `commitSync()` | 处理完再提交，失败重试 | 吞吐略降 |
| 手动异步 `commitAsync()` | 异步提交不阻塞消费 | 失败不重试，退出前补一次 sync |
| 提交指定 offset | `commitSync(offsets)` 精确控制 | — |

**生产建议：关闭自动提交，处理成功后手动提交，并配业务幂等兜底**（重平衡天然带来重复）。

## 什么是重平衡（Rebalance）？有什么危害？

消费者组的成员或订阅变化时，分区重新分配：

**触发条件**：消费者加入/退出（宕机、被踢）、订阅的 topic 或分区数变化。

危害：

- **STW**：重平衡期间**整组停止消费**，几秒到几分钟
- 频繁触发（GC 停顿、处理超时被踢）→ 消费断断续续、积压
- 可能重复消费（未提交的处理位点）

缓解：

| 手段 | 参数 |
|------|------|
| 心跳与处理解耦 | `max.poll.interval.ms` 调大（默认 5min），处理慢别超时 |
| 单批别拉太多 | `max.poll.records` 调小 |
| 合理心跳 | `session.timeout.ms` / `heartbeat.interval.ms` |
| **协同增量重平衡** | 2.4+：`partition.assignment.strategy=CooperativeStickyAssignor`，只迁移必要分区，不再全组 STW |

## 分区分配策略有哪些？

| 策略 | 规则 |
|------|------|
| Range | 按 topic 逐个分，前面的消费者多拿（**容易倾斜**） |
| RoundRobin | 全部分区打散轮询 |
| Sticky | 尽量保留原分配，减少变动 |
| **CooperativeSticky（2.4+）** | Sticky + 增量重平衡，推荐 |

## 消息丢失与重复消费怎么处理？

**丢消息的三种可能**：

| 环节 | 原因 | 对策 |
|------|------|------|
| 生产端 | acks=0/1，发送失败没重试 | acks=all + retries + 回调确认 |
| Broker | uncached leader 选举 / 磁盘故障 | min.insync.replicas≥2，禁 unclean 选举 |
| 消费端 | 自动提交：处理前提交了 offset | 手动提交，处理成功后再提交 |

**重复消费不可避免**（重平衡、重试都会带来），对策是**消费端幂等**：

- 唯一键落库（`insert ignore` / 唯一索引）
- 以 <bizId> 为幂等键写 Redis/DB 判重
- 版本号 / 状态机校验

## 怎么保证消息顺序？

- Kafka 只保证**分区内有序**
- 全局有序：topic 单分区（牺牲吞吐）
- 局部有序（常见需求：同一订单的事件有序）：**同 key（orderId）路由到同一分区**
- 坑：重试乱序（见 Producer 章）、扩分区破坏同 key 路由、重平衡期间换消费者不影响顺序

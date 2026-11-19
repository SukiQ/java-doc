---
title: Kafka 生产者
---

# Kafka 生产者


## Producer 发送消息的流程？

```mermaid
flowchart LR
    A[拦截器<br/>Interceptor] --> B[序列化器<br/>Serializer] --> C[分区器<br/>Partitioner] --> D["累加器 RecordAccumulator<br/>按分区攒批"] --> E["Sender 线程<br/>批量发送到对应 Broker"]
```

- 主线程只负责拦截 → 序列化 → 分区 → 入缓冲，**发送由独立 Sender 线程异步完成**
- `batch.size`（默认 16KB）攒够 或 `linger.ms`（默认 0）到点即发
- 发送结果通过回调（Callback）通知，失败可配置重试

## 分区策略有哪些？

| 策略 | 规则 |
|------|------|
| 指定分区 | 消息带 partition 直接用 |
| **按 key hash** | 有 key 时 `murmur2(key) % 分区数`，**同 key 必然同分区 → 局部有序** |
| 无 key 轮询/粘性 | 3.0+ 默认 Sticky：一批填满一个分区再换下一个，减少请求次数 |
| 自定义 | 实现 `Partitioner`（如按机房、按业务规则） |

**坑**：按 key hash 依赖分区数——**扩分区后同 key 会路由到新分区**，破坏顺序（顺序敏感的 topic 要提前规划分区数）。

## acks 参数是什么？

Producer 等待多少副本确认才算发送成功：

| acks | 含义 | 可靠性 / 吞吐 |
|------|------|---------------|
| 0 | 发出去就算成功，不等 | 最高吞吐，可能丢消息 |
| 1 | Leader 写入即成功 | Leader 挂了且未同步 → 丢 |
| **all / -1** | ISR 内全部副本写入 | 最安全，配合 `min.insync.replicas=2` |

- `min.insync.replicas=2`：ISR 至少 2 个副本才接受写入，否则报错——**防止单副本 Leader 挂掉丢数据**
- 三者组合：`acks=all + min.insync.replicas=2 + replication.factor=3` 是生产可靠性的标配

## Producer 怎么保证不丢消息？

发送端逐层设防：

```properties
acks=all                      # ISR 全确认
retries=Integer.MAX_VALUE     # 失败重试
delivery.timeout.ms=120000    # 重试总超时上限
enable.idempotence=true       # 幂等，重试不产生重复
```

同时依赖 Broker：`min.insync.replicas >= 2`、禁止 `unclean.leader.election.enable`。

**重试带来的副作用**：重试可能乱序（前一批失败、后一批成功）→ `max.in.flight.requests.per.connection <= 5`（幂等开启时 broker 仍能保证顺序）。

## 幂等和事务是什么？

**幂等（enable.idempotence）**：解决**单分区单会话**的重试重复。

- Producer 启动时申请 PID，每条消息带 <PID, partition, 序列号>
- Broker 记录每个 <PID, 分区> 的最新序列号，重复序号拒绝写入
- 局限：PID 每次重启会变，跨会话/跨分区无效

**事务**：跨分区、跨会话的 exactly-once 写入。

```java
producer.initTransactions();
producer.beginTransaction();
producer.send(offsetsRecord);          // 把消费位点也写进事务
producer.send(producerRecord);         // 业务消息（可发多个分区/topic）
producer.sendOffsetsToTransaction(offsets, groupMetadata);  // consume-transform-produce
producer.commitTransaction();
```

- 依赖 `transactional.id`（跨会话稳定，用于恢复或 fencing 旧实例）
- TransactionCoordinator 协调，两阶段提交写 `__transaction_state`
- 主要支撑 **Kafka Streams / consume-transform-produce** 场景，外部系统不适用（对外仍需业务幂等）

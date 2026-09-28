---
title: 分布式唯一 ID
---

# 分布式唯一 ID

## 全局唯一 ID 有哪些生成方案？

### 为什么需要分布式 ID

单库 `auto_increment` 在**分库分表 / 多实例**场景下会重复 → 需要全局唯一的 ID 生成方案。

### 好的唯一 ID 的要求

- **全局唯一**：基本要求，绝不能重复
- **趋势递增**：InnoDB 聚簇索引有序写入，避免页分裂（UUID 做主键的问题）
- **高性能**：本地生成优先，尽量不走网络
- **高可用**：ID 服务挂了不能拖垮业务
- **信息安全**：连续 ID 会暴露业务量（订单号被爬），必要时加混淆

### 方案总览

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **UUID** | 本地生成 128 位随机串 | 本地生成、性能高、零依赖 | **无序**（页分裂）、36 位太长、无业务含义 |
| **数据库自增** | `auto_increment` | 简单、有序 | DB 写瓶颈、单点；扩容困难 |
| **号段模式** | 一次从 DB 取一段（如 1000 个）在内存发号 | DB 压力降千倍、趋势递增 | 重启浪费号段；多实例间不严格递增 |
| **Redis INCR** | Redis 原子自增 | 性能好、单调递增 | 强依赖 Redis；持久化丢数据可能重号 |
| **雪花算法** | 64 位 = 时间戳 + 机器ID + 序列号 | 本地生成、高性能、趋势递增 | 时钟回拨问题；workerId 需要协调分配 |
| **开源框架** | Leaf / TinyID / UidGenerator | 生产级完整方案 | 引入额外组件 |

### UUID 为什么不适合做主键（高频追问）

- 36 个字符太长，主键 + 二级索引存储成本翻倍
- **无序**：聚簇索引要求主键有序，UUID 随机插入 → 频繁**页分裂**、写放大、BufferPool 命中率低
- 无时间信息，无业务语义
- MySQL 8.0 `UUID_TO_BIN(uuid, 1)` 可转成时间有序的 UUID，缓解但不根治

### 数据库自增的多实例扩展

```
DB1: start=1, step=2 → 1, 3, 5, 7 ...
DB2: start=2, step=2 → 2, 4, 6, 8 ...
```

步长固定 → **扩容要重新规划**，DB 压力也没真正分散，只适合小规模过渡。

### 号段模式（Leaf-Segment）

- DB 表存 `biz_tag, max_id, step`，`UPDATE max_id = max_id + step` 一次性原子取走一个号段，内存中慢慢发
- **双 buffer 优化**：当前号段用到 10% 时，异步预加载下一个号段 → DB 短暂宕机不影响发号
- 滴滴 TinyID = 号段模式 + 多 DB 预分配，思路相同

### 雪花算法（Snowflake）★ 重点

64 位结构：

```
| 1 位符号 | 41 位时间戳 | 10 位机器 ID | 12 位序列号 |
|  固定 0  |  可用 69 年 |  1024 台机器 | 每毫秒 4096 个 |
```

单机理论上限：4096 × 1000 = **409.6 万/秒**。

Java 实现（核心：`synchronized` + 位运算）：

```java
public class SnowflakeIdWorker {
    private final long epoch = 1704038400000L;               // 起始时间戳 2024-01-01
    private final long workerIdBits = 10L;
    private final long sequenceBits = 12L;
    private final long maxWorkerId = ~(-1L << workerIdBits); // 1023
    private final long sequenceMask = ~(-1L << sequenceBits);// 4095
    private final long workerIdShift = sequenceBits;         // 12
    private final long timestampShift = sequenceBits + workerIdBits; // 22

    private final long workerId;
    private long sequence = 0L;
    private long lastTimestamp = -1L;

    public SnowflakeIdWorker(long workerId) {
        if (workerId < 0 || workerId > maxWorkerId)
            throw new IllegalArgumentException("workerId 非法");
        this.workerId = workerId;
    }

    public synchronized long nextId() {
        long timestamp = System.currentTimeMillis();
        if (timestamp < lastTimestamp)                       // 时钟回拨
            throw new IllegalStateException("时钟回拨，拒绝发号");
        if (timestamp == lastTimestamp) {                    // 同一毫秒内序列自增
            sequence = (sequence + 1) & sequenceMask;
            if (sequence == 0)                               // 本毫秒用完，自旋等下一毫秒
                timestamp = tilNextMillis(lastTimestamp);
        } else {
            sequence = 0L;
        }
        lastTimestamp = timestamp;
        return ((timestamp - epoch) << timestampShift)
                | (workerId << workerIdShift)
                | sequence;
    }

    private long tilNextMillis(long lastTimestamp) {
        long t = System.currentTimeMillis();
        while (t <= lastTimestamp) t = System.currentTimeMillis();
        return t;
    }
}
```

### 时钟回拨怎么办？（高频追问）

NTP 校时 / 虚拟机漂移导致系统时间倒退 → 同一毫秒可能重复发号。

| 策略 | 做法 |
|------|------|
| 小幅回拨等待 | 回拨 < 几毫秒：自旋等到 `lastTimestamp` 再发号 |
| 大幅回拨拒绝 | 超过阈值直接报错告警（Leaf 默认策略），人工介入 |
| 扩展位记录 | 用预留位记录回拨次数，回到旧时间戳继续发号 |
| 预消费未来时间 | 百度 UidGenerator：以未来某时刻为基准提前生成，天然容忍回拨 |

### workerId 怎么分配？

- **静态配置**：机器少时最简单
- **ZooKeeper 顺序节点**：Leaf-Snowflake 的做法，启动时注册拿号并**落本地缓存文件**，ZK 挂了也能启动
- **数据库表分配**：机器注册时插入自增记录
- K8s 下可用 StatefulSet 序号 / Pod 序号

### 开源方案对比

| 框架 | 出品 | 模式 | 特点 |
|------|------|------|------|
| **Leaf** | 美团 | 号段 + Snowflake 双模式 | 使用最广；号段双 buffer，snowflake 用 ZK 分配 workerId |
| **TinyID** | 滴滴 | 号段 | Leaf-segment 思路 + 多 DB，HTTP 接入，轻量 |
| **UidGenerator** | 百度 | Snowflake 变体 | RingBuffer 预生成，吞吐极高；workerId 由 DB 分配 |

### 选型

```
不想引入组件      → 自己实现雪花算法（必须处理时钟回拨 + workerId 分配）
订单类趋势递增    → Leaf-segment（号段模式）
超高并发发号      → UidGenerator（RingBuffer 预生成）
```

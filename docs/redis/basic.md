---
title: Redis 基础与数据结构
---

# Redis 基础与数据结构


## Redis 为什么这么快？

| 原因 | 说明 |
|------|------|
| **纯内存** | 核心操作在内存完成，这是数量级的根本 |
| 高效数据结构 | SDS、跳表、listpack、整数集合等按场景特化 |
| 单线程无锁 | 命令串行执行，无锁竞争、无线程上下文切换 |
| IO 多路复用 | epoll + 事件驱动（Reactor 模型），单线程监听大量连接 |

一句话：**内存 + 特化数据结构 + 无锁 + epoll**，瓶颈通常在网络与内存而非 CPU。

## Redis 是单线程的吗？

**命令执行始终单线程**，但进程并非只有一个线程：

| 线程 | 职责 |
|------|------|
| 主线程 | 所有命令的执行 |
| 后台线程 | 关闭文件、AOF 刷盘、异步删除（`unlink` / `flushdb async`） |
| IO 线程（6.0+） | 并行读写 socket、解析协议，**命令仍串行执行** |

- 为什么命令不做成多线程：瓶颈不在 CPU；锁竞争会破坏简单性与单命令原子性
- 大 key 删除会阻塞主线程 → 用 `UNLINK` 异步删

## Redis 有哪些数据类型？各自的场景？

| 类型 | 场景 | 常用命令 |
|------|------|----------|
| **String** | 缓存对象（JSON）、计数器、分布式锁 | set / get / incr |
| **Hash** | 对象属性分散存、购物车（uid → {skuId: num}） | hset / hget / hgetall |
| **List** | 消息队列、最新列表（朋友圈） | lpush / brpop / lrange |
| **Set** | 去重、共同好友（交集）、抽奖随机弹出 | sadd / sinter / spop |
| **ZSet** | 排行榜、延迟队列（score 存执行时间） | zincrby / zrevrange |
| Bitmap | 签到、日活跃统计（1 亿用户 ≈ 12MB） | setbit / bitcount |
| HyperLogLog | UV 估算，0.81% 误差，固定 12KB | pfadd / pfcount |
| GEO | 附近的人 / 门店 | geoadd / geosearch |
| Stream | 消息队列：消费组、ACK、待处理列表 | xadd / xreadgroup / xack |

### 底层编码（了解）

| 类型 | 编码（小数据 → 大数据） |
|------|--------------------------|
| String | int / embstr(≤44B) / raw(SDS) |
| Hash | listpack → hashtable |
| ZSet | listpack → skiplist + dict |
| Set | intset / listpack → hashtable |

小对象用紧凑结构省内存，超过阈值自动转换（如 `hash-max-listpack-entries`）。

## 什么是渐进式 rehash？

字典扩容/缩容时不一次性迁移，而是：

- 新旧两张哈希表并存，**每次增删改查顺带迁移一部分**，另有后台定时迁移
- 查询先查旧表再查新表；新写入只进新表
- 迁移完成后旧表释放

避免百万级 key 一次性 rehash 造成长时间卡顿。

## 跳表（ZSet 底层）是什么？

- 多层链表：底层全量节点，上层逐层抽样（每层 1/2 概率提升），查找从顶层往下，平均 O(logN)
- 为什么 ZSet 用跳表不用红黑树：**范围查询友好**（zrange 沿底层链表走）、实现简单、无旋转调整
- 同时配一个 dict 做 member → score 的 O(1) 查询

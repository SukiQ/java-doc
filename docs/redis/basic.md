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

| 类型 | 一句话定位 |
|------|------------|
| **String** | 万能值：缓存 JSON、计数器、分布式锁 |
| **Hash** | 对象字段局部读写，购物车 |
| **List** | 双端队列：简单消息队列、最新列表 |
| **Set** | 去重与集合运算：共同好友、抽奖 |
| **ZSet** | 带 score 排序：排行榜、延迟队列 |
| Bitmap | 位级布尔：签到、日活 |
| HyperLogLog | 基数估算：UV，12KB 固定 |
| GEO | 经纬度与附近查询 |
| Stream | 持久化消息队列：消费组 + ACK |

### String：字符串

最基础类型，可存字符串、整数、浮点数、二进制（图片序列化等）。

```bash
set key value [ex 10 | px 10000] [nx | xx]   # ex 过期 / nx 不存在才写（锁）
setnx key value                               # 等价 set nx
mset k1 v1 k2 v2 / mget k1 k2                 # 批量，省网络往返
incr key / incrby key 10 / incrbyfloat        # 原子自增（值必须是数字）
append key s / getrange key 0 3 / strlen key
```

**场景**：

- 缓存对象：整体 JSON 存取（配合 TTL）
- **计数器**：阅读量、点赞数、限流计数，`incr` 原子性
- **分布式锁**：`set key uuid nx ex 10`
- 全局 ID：`incr` 自增（简单场景）

### Hash：哈希

field-value 结构，适合**对象属性的局部读写**。

```bash
hset user:1 name tom age 18
hget user:1 name / hmget user:1 name age / hgetall user:1
hincrby user:1 age 1        # 单字段原子自增
hdel user:1 age / hlen user:1 / hexists user:1 name
```

**场景**：

- **购物车**：`hset cart:{uid} {skuId} {num}`，增删改查都是单字段
- 对象存储：改一个属性不用整体读写（对比 String 存 JSON）

### List：列表

双向链表语义，头尾操作 O(1)。

```bash
lpush queue task / rpush queue task        # 头插 / 尾插
rpop queue / brpop queue 5                 # 尾出（可阻塞 5s）
lrange queue 0 -1                          # 区间查（0 -1 = 全量）
lindex queue 0 / llen queue / ltrim key 0 99   # 只留前 100
lmove src dst LEFT RIGHT                   # 6.2+，可靠转移
```

**场景**：

- **简单消息队列**：lpush 生产 + brpop 消费（阻塞轮询）
- 最新列表：朋友圈、微博时间线，lpush + ltrim 只保留前 N 条


> [!CAUTION]
> List 队列无 ACK、无消费组、消费者取走即丢，可靠性要求高用 Stream 或 MQ。

### Set：集合

无序、去重。

```bash
sadd tags java redis / srem tags java
sismember tags java / smembers tags / scard tags
sinter a b            # 交集   sunion 并集   sdiff 差集
spop tags             # 随机弹出（抽奖）/ srandmember 随机看不删
```

**场景**：

- **去重**：点赞用户、抽奖名单、白名单
- **共同关注**：`sinter follow:a follow:b`
- 抽奖：`spop` 随机弹出、`srandmember key n` 抽 n 个不删除


### ZSet：有序集合

Set 的每个元素带 **score**，按 score 排序。

```bash
zadd rank 100 tom 90 jerry          # 加成员
zincrby rank 5 tom                  # 加分（原子）
zrevrange rank 0 9 withscores       # TOP 10（降序）
zrangebyscore rank 80 90            # 分数区间（延迟队列扫到期任务）
zrank rank tom / zrevrank           # 排名
zcount rank 80 90 / zscore rank tom / zrem rank tom
```

**场景**：

- **排行榜**：zincrby 加分 + zrevrange 取前 N + zrevrank 查自己名次
- **延迟队列**：score 存执行时间戳，定时 `zrangebyscore key 0 now limit 0 10` 取到期任务

### Bitmap：位图

String 上的位操作，由于 Redis 的 String 最大可达 512 MB，在面对海量布尔状态统计时，Bitmap 能够把空间占用压缩到极致。

```bash
setbit sign:2026-11:1001 5 1       # uid=1001 第 5 天签到
getbit sign:2026-11:1001 5
bitcount sign:2026-11:1001         # 本月签到天数
bitcount active:20261118           # 当日活跃用户数
bitop and result a b               # 位运算：连续 N 天活跃
```

**场景**：签到（一个月一个 key）、日活统计（uid 作偏移量，1 亿用户 ≈ 12MB/天）。

### HyperLogLog：基数估算

估算集合基数（去重个数），**每个 key 固定约 12KB，标准误差 0.81%**。

```bash
pfadd uv:20261118 user1 user2      # 记录访问
pfcount uv:20261118                # 估算 UV
pfmerge uv:week uv:d1 uv:d2 ...    # 合并多天
```

**场景**：页面/接口用户访问量、亿级用户去重计数。

### GEO：地理位置

存经纬度、算距离、查附近，**底层是 ZSet**（经纬度编码成 geohash 整数放 score）。

```bash
geoadd stores 116.40 39.90 "望京店" 116.48 39.92 "酒仙桥店"
geodist stores 望京店 酒仙桥店 km
geosearch stores frommember 望京店 byradius 3 km asc count 10   # 附近 3km
```

**场景**：附近的人、附近门店、配送范围圈定。

### Stream：消息流

5.0+ 的持久化消息队列，补齐 List 队列缺失的**消费组、ACK、待重试**能力。

```bash
xadd mq * event orderCreated orderId 1001     # * 自动生成消息 ID
xlen mq / xrange mq - +
xgroup create mq g1 0                          # 创建消费组
xreadgroup group g1 c1 count 10 streams mq >   # 消费
xack mq g1 1712345678-0                        # 确认
xpending mq g1                                  # 查待确认
xclaim mq g1 c1 60000 id                       # 超时转移给别的消费者
```

**场景**：轻量级 MQ——订单异步入账、日志收集，不想引入 RocketMQ/Kafka 时。

## 什么是渐进式 rehash？

字典扩容/缩容时不一次性迁移，而是：

- 新旧两张哈希表并存，**每次增删改查顺带迁移一部分**，另有后台定时迁移
- 查询先查旧表再查新表；新写入只进新表
- 迁移完成后旧表释放

避免百万级 key 一次性 rehash 造成长时间卡顿。

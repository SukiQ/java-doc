---
title: Redis 持久化与内存
---

# Redis 持久化与内存


## RDB 和 AOF 的区别？

| 对比 | RDB 快照 | AOF 日志 |
|------|----------|----------|
| 原理 | 某时刻全量内存快照（二进制） | 每条写命令追加到日志 |
| 触发 | `save`（阻塞）/ `bgsave`（fork 子进程）/ 自动条件 | 每次写入后（按 fsync 策略） |
| 数据安全 | 两次快照之间的数据会丢 | 最多丢 1s（everysec） |
| 文件与恢复 | 文件小、恢复快 | 文件大、恢复慢（逐条重放） |
| 性能影响 | fork 瞬间开销 | everysec 后台线程刷盘 |

### AOF 刷盘策略

```ini
# 开启 AOF 持久化
appendonly yes

# 设置刷盘策略：always | everysec | no
appendfsync everysec
```

- always：每条命令刷盘，最多丢一条，最慢
- **everysec（默认）**：每秒刷盘，最多丢 1 秒，折中
- no：交给 OS，最快，丢多少看运气

### 混合持久化

重写时：RDB 格式头部（全量）+ AOF 增量尾部。恢复快 + 丢失少，生产推荐。

> [!IMPORTANT]
> 4.0+引入，5.0后默认开启

```ini
aof-use-rdb-preamble yes
```

## RDB 怎么触发？

### 触发方式

| 方式 | 说明 |
|------|------|
| 手动 `save` | 主线程直接生成，**全程阻塞**，生产禁用 |
| 手动 `bgsave` | fork 子进程生成快照，主线程继续服务 |
| 自动条件 | `save m n`：m 秒内至少 n 次修改，满足任一条即 bgsave |
| 其他 | 正常 shutdown、主从全量同步时自动触发 |

```ini
save 900 1              # 900s 内 1 次修改
save 300 10             # 300s 内 10 次
save 60 10000           # 60s 内 1 万次；save "" 可关闭自动快照
stop-writes-on-bgsave-error yes   # 快照失败时拒绝写入（及时暴露磁盘故障）
rdbcompression yes                # LZF 压缩
```

## bgsave 期间还能写入吗？

fork 后父子进程**共享物理内存页**，子进程读旧页生成 RDB；父进程修改某页时触发**写时复制（COW）**，复制该页再写。

## Redis 过期键的删除策略？

| 策略 | 做法 |
|------|------|
| **惰性删除** | 访问 key 时检查过期才删；不访问就一直占内存 |
| **定期删除** | 每 100ms（`hz=10`）随机抽 20 个带 TTL 的 key，删除其中过期的；过期占比 > 25% 就再抽一轮 |

- 主从复制：**从库不主动删**，等主库删除后同步 DEL 命令（保证一致性）
- 惰性 + 定期漏掉的，交给内存淘汰策略兜底

## Redis 的回收策略（淘汰策略）？

`maxmemory` 达到上限后按 `maxmemory-policy` 淘汰（8 种）：

- **noeviction（默认）**：拒绝写入，返回 OOM 错误
- **allkeys-lru**：近似 LRU，淘汰最近最少用的缓存策略
- **allkeys-lfu**：按访问频率，淘汰最少用的缓存策略
- allkeys-random：随机淘汰任意 key
- volatile-lru：淘汰设了过期时间的，最近最少用的缓存策略
- volatile-ttl：优先淘汰剩余存活时间最短的 key

## 什么是大 key 问题？怎么排查和解决？

value 过大的 key（**参考阈值：String > 10KB，集合类元素 > 5000 或总量 > 10MB**，最终以"操作耗时 + 业务 QPS"判断）。
    

### 排查

| 手段 | 说明 |
|------|------|
| `redis-cli --bigkeys` | 在线抽样扫描，列出各类型最大 key；适合巡检，只有 top 无分布 |
| `MEMORY USAGE key` | 精确看单个 key 占用（含底层结构开销） |
| **RDB 离线分析** | rdb-tools / redis-rdb-cli 解析 RDB 出 CSV 报表，按大小排序，**不影响线上，生产首选** |
| 慢查询日志 | `SLOWLOG GET` 看耗时命令，反推大 key |
| Proxy / SDK 埋点 | 网关层统计请求的 value 大小分布 |

典型流程：`--bigkeys` 发现疑点 → `MEMORY USAGE` 确认 → 结合业务代码定位来源（谁在写、能不能拆）。

### 解决

| 手段 | 做法 |
|------|------|
| **拆分（根治）** | 大 Hash 分桶：`big:{fieldhash%100}`；大 ZSet 按时间/范围分片；大 String JSON 拆成 Hash 按字段读写 |
| 压缩 | value 用 snappy/gzip 压缩，CPU 换网络与内存 |
| **删除用 UNLINK** | `UNLINK key` 后台线程异步释放，代替 `DEL`；`lazyfree-lazy-expire yes` 让过期也异步 |
| 渐进清理 | 已存在的大集合用 `hscan` + `hdel` 分批删，避免一次性 |
| 预防 | 上线规范卡控单 key 大小；监控 top N 内存 key 告警 |



## 什么是热 key 问题？怎么排查和解决？

**少量 key 的访问频率极高**（爆款商品、热搜词条），流量集中打到**单个分片/节点**，集群其他节点闲置——扩容也解决不了。


### 排查

| 手段 | 说明 |
|------|------|
| `redis-cli --hotkeys` | 需 `maxmemory-policy` 为 lfu，返回访问频率 top |
| `OBJECT FREQ key` | lfu 模式下查单个 key 的访问频率 |
| `MONITOR`（慎用） | 抓全量命令统计频次，本身开销大，只在低峰短开 |
| **客户端/Proxy 统计（最准）** | SDK 拦截器或网关按 key 计数，聚合出 QPS top N |
| 云控制台 | 阿里云/腾讯云自带实时热 key 分析 |

### 解决

| 手段 | 做法 |
|------|------|
| **本地缓存兜一层（首选）** | 应用内存 Caffeine 缓存热 key，短 TTL + 异步刷新，读请求不出进程 |
| **key 打散多副本** | 同一份数据写 `hot:{0..9}` 十份（可落不同分片），读时随机选一个，流量摊薄；更新要全量更新 |
| 读写分离 | 热点读走从库，摊到多个节点 |
| 永不过期 + 异步刷新 | 杜绝热 key 过期瞬间的击穿 |
| 限流/熔断兜底 | 真 DB 侧限流，防连锁雪崩 |
| 预防 | 大促前热点预热；按 key 粒度 QPS 监控告警 |

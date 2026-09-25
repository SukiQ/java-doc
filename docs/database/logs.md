# 日志


## redo log、undo log、binlog 的区别？

| 对比 | redo log | undo log | binlog |
|------|----------|----------|--------|
| 层级 | InnoDB 引擎层 | InnoDB 引擎层 | Server 层（所有引擎都有） |
| 内容 | **物理日志**：某页某处改成了什么 | **逻辑日志**：反向操作（insert↔delete） | **逻辑日志**：语句或行变更 |
| 作用 | **崩溃恢复**（持久性 D） | **回滚**（原子性 A）+ MVCC 版本链 | **主从复制、数据恢复**（归档） |
| 写入方式 | 固定大小，**循环写**（write pos 追 check point） | 随事务写，提交后待 purge | **追加写**，写满换文件 |
| 刷盘时机 | `innodb_flush_log_at_trx_commit`（0/1/N） | 随事务 | `sync_binlog`（0/1/N） |

### redo log：循环写

```
|||||||||||||||||________|
↑write pos          ↑check point
（写入位置）        （可覆盖位置）
写满 → 推进 check point 刷脏页腾空间 → "抖一下"
```

### redo 刷盘参数

| innodb_flush_log_at_trx_commit | 含义 | 安全性 |
|------|------|--------|
| 1（默认） | 每次提交 fsync | 最安全，最多丢 1 秒都丢不了 |
| 0 | 每秒刷 | 崩溃丢 1 秒 |
| 2 | 提交写 OS cache，每秒 fsync | 崩溃（OS 不挂）不丢，主机挂丢 1 秒 |

binlog 的 `sync_binlog=1` 同理，"双 1 配置"= 最安全。

### binlog 三种格式

| 格式 | 内容 | 特点 |
|------|------|------|
| STATEMENT | 记 SQL 原文 | 量小；但 now()/uuid() 等在从库结果可能不一致 |
| **ROW**（默认） | 记每行变更前后镜像 | 绝对一致；量大（批量 update 记全量行） |
| MIXED | 默认 STATEMENT，不稳定语句切 ROW | 折中 |

### 崩溃恢复各管一段

```
事务回滚        → undo log
提交后崩溃恢复  → redo log 重放（补齐未刷盘的数据页）
误操作/归档恢复 → binlog + 全量备份
主从同步        → binlog
```

### 总结

```
redo：物理、引擎层、循环写、管持久性（恢复"已提交"）
undo：逻辑、引擎层、管回滚 + MVCC 旧版本
binlog：逻辑、Server 层、追加写、管复制与归档
```

面试要点：物理 vs 逻辑日志、循环写 vs 追加写、redo/binlog 刷盘参数与双 1 配置、binlog 三格式取舍。



## 什么是两阶段提交？

redo log（引擎层）和 binlog（Server 层）是两个独立的日志系统，两阶段提交（2PC）保证**两者一致**，避免主从不一致或恢复缺数据。

### 流程

```
事务提交：
1. redo log 写入，状态 = prepare     ← 阶段一
2. binlog 写入并 fsync
3. redo log 状态 = commit           ← 阶段二（只是改标记）

崩溃恢复规则（redo 处于 prepare 时检查 binlog）：
├── binlog 完整（有对应 XID）→ 提交事务（重放 redo）✅
└── binlog 不完整            → 回滚事务（用 undo）❌
```

### 为什么必须两阶段？

反证：如果先写 redo 后写 binlog（无 2PC 约束的顺序提交）：

| 崩溃时机 | 后果 |
|----------|------|
| redo 写完、binlog 没写 | 恢复后主库有该事务，**binlog 缺失 → 从库没有** → 主从不一致 |
| 先 binlog 后 redo、redo 没写 | binlog 有、主库没有 → 从库多数据 |

两阶段提交让 binlog 成为"最终裁决"：binlog 完整才提交，保证两个日志要么都有要么都没有。

### 组提交（提升性能）

多个并发事务的 binlog **合并成一次 fsync**（`binlog_group_commit_sync_delay` 聚合窗口），缓解磁盘 IO 压力，2PC 语义不变。

### 总结

```
两阶段提交 = redo(prepare) → binlog → redo(commit)
崩溃时以 binlog 是否完整为准：完整则提交，不完整则回滚
目的：redo 与 binlog 的原子一致性 → 主从一致 + 恢复不丢
```

面试要点：三个阶段顺序、崩溃恢复的裁决规则（看 binlog）、不用 2PC 会出现的两种不一致、组提交的作用。

---
title: 死锁
---

# 死锁




## MySQL 如何定位解决死锁问题？

### 常见死锁场景

| 场景 | 过程 |
|------|------|
| **相反顺序更新** | 事务1：锁 A 等 B；事务2：锁 B 等 A |
| **间隙锁 + 插入** | RR 下事务1 gap 锁住范围，事务2 insert 等插入意向锁，两者互相等待 |
| **唯一键并发插入** | 两个事务同时 insert 同一唯一键，一个拿到锁另一个等待，先拿的又因后续操作等对方 |

### 第一步：定位

| 手段 | 说明 |
|------|------|
| `show engine innodb status` | 看 **LATEST DETECTED DEADLOCK** 段：两个事务各自的 SQL、持有/等待的锁、谁被回滚 |
| `innodb_print_all_deadlocks=ON` | 每次死锁都记入 error log，不只保留最后一次 |
| `sys.innodb_lock_waits` / `performance_schema.data_lock_waits` | **实时**看锁等待关系（谁堵谁，未到死锁程度也能看） |
| 应用日志 | 捕获 `ERROR 1213 (Deadlock found when trying to get lock)` 定位 SQL |

### 第二步：事后处理（MySQL 已自动兜底）

| 机制 | 说明 |
|------|------|
| **死锁检测**（默认开启） | `innodb_deadlock_detect=ON`：发现等待环，立即回滚代价小的事务并报 1213 |
| 应用重试 | 捕获 1213 后**自动重试**（小事务重试成功率高），配合有限次数 + 退避 |
| `innodb_lock_wait_timeout` | 只是**等锁超时**（默认 50s），不是死锁处理；线上常调小（如 2~5s）快速失败 |

### 第三步：事前避免（治本）

| 措施 | 针对场景 |
|------|----------|
| **统一加锁顺序** | 批量 update 前先按主键**排序**，所有事务同序访问 |
| **小事务** | 事务里别放 RPC/耗时操作，锁持有时间短 |
| **SQL 走索引** | 无索引 → 锁扩大到全表扫描过的记录，死锁概率剧增 |
| 降级 RC | 间隙锁大幅减少（RR 特有的 gap/next-key 死锁消失） |
| 并发插入唯一键 | 改 `insert ... on duplicate key update` 或先 `select for update` |
| 热点行 | 合并更新（攒批）、队列串行化（如扣减走 Redis/单队列） |

---
title: 锁
---

# 锁




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






## 幻读是如何解决的？

RR 级别下，快照读和当前读用**不同机制**解决幻读：

| 读类型 | 机制 | 说明 |
|--------|------|------|
| 快照读（普通 select） | **MVCC** | ReadView 固定，后插入的行 trx_id 不可见，读不到"幻影" |
| 当前读（update / for update / lock in share mode） | **Next-Key Lock** | 锁住记录 + 间隙，别的事务插不进来 |

### Next-Key Lock 防幻读示例

```sql
-- 表有 id: 1, 5, 10
-- 事务A（RR）
select * from t where id between 1 and 10 for update;
-- 加锁：(负无穷,1] (1,5] (5,10] (10,正无穷)  ← 记录+两侧间隙
-- 事务B 想 insert id=7 → 落在 (5,10) 间隙 → 阻塞，A 看不到新行 → 无幻读 ✅
```

### 两个"幻读穿透"场景

MVCC + Next-Key 仍无法完全消灭幻读：

```
场景1：先快照读，后当前读
事务A：select * from t where id = 15;        -- 快照读，读不到（无此行）
事务B：insert id = 15; commit;
事务A：update t set ... where id = 15;        -- 当前读：能改到（发现新行）✊
事务A：select * from t where id = 15;         -- 更新后 trx_id 变成自己，可见 → "幻读"出现

场景2：先当前读（for update），但条件未命中加不上锁
事务A：select * from t where id = 15 for update;  -- 行不存在，锁不住不存在的行
事务B：insert id = 15; commit;
事务A：select * from t where id = 15;              -- 读到了 → "幻读"
```

严格防幻读：事务一开始就 `for update` 锁住范围（Gap Lock 防插入），或用 Serializable。

### 总结

```
快照读防幻读：MVCC（ReadView 固定，新行不可见）
当前读防幻读：Next-Key Lock（锁记录 + 间隙，堵住插入）
完全杜绝：Serializable 或全程 for update
```

面试要点：两类读的不同防幻读机制、Next-Key 加锁区间示例、两个穿透场景的成因。

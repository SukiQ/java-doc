# SQL 优化


## 如何查看执行计划？

两大工具：**explain** 看执行计划长什么样，**trace** 看优化器为什么这么选。

### explain

`EXPLAIN` 模拟优化器执行 SQL，展示**是否走索引、扫描多少行、用了什么连接方式**，是 SQL 调优的第一步。

```sql
EXPLAIN select * from user where name = 'abc';
```

衍生用法：

```sql
EXPLAIN FORMAT=JSON ...   -- 输出成本细节（更详细的 cost）
EXPLAIN ANALYZE ...       -- 8.0.18+：真正执行并给出每步实际耗时/行数
```

### 输出列总览

| 列 | 说明 | 重要度 |
|----|------|--------|
| id | 执行顺序 | ⭐⭐ |
| select_type | 查询类型 | ⭐ |
| table | 当前行操作的表 | ⭐ |
| type | **访问类型（索引使用情况）** | ⭐⭐⭐ |
| possible_keys | 可能用到的索引 | ⭐ |
| key | **实际用到的索引** | ⭐⭐⭐ |
| key_len | 索引使用长度（判断用了复合索引几列） | ⭐⭐ |
| ref | 与索引比较的列或常量 | ⭐ |
| rows | **预估扫描行数** | ⭐⭐⭐ |
| filtered | 过滤后剩余比例 | ⭐ |
| Extra | **附加信息（filesort/temporary 等）** | ⭐⭐⭐ |

### id：执行顺序

| 情况 | 含义 |
|------|------|
| id 相同 | 从上到下顺序执行 |
| id 不同 | **越大越先执行**（子查询先跑） |
| id 有相同有不同 | 先按大的执行，同大的从上往下 |

### select_type 常见值

| 值 | 含义 |
|----|------|
| SIMPLE | 简单查询（无子查询/UNION） |
| PRIMARY | 外层主查询 |
| SUBQUERY | 子查询 |
| DERIVED | 派生表（from 中的子查询） |

### type：访问类型（性能从好到差）

```
system > const > eq_ref > ref > range > index > ALL
   优 ──────────────────────────────────────→ 差
生产要求：至少 range 级别；ref 以上算健康；ALL 必须优化
```

| type | 含义 | 示例 |
|------|------|------|
| system | 系统表，只有一行 | |
| const | 主键/唯一索引等值查询，最多一行 | `where id = 1` |
| eq_ref | 连接时被驱动表走主键/唯一索引 | `join on a.id = b.id` |
| ref | 普通索引等值查询 | `where name = 'x'`（name 有索引） |
| range | 索引范围扫描 | `where id > 10`、`between`、`in` |
| index | 扫整棵索引树（比 ALL 好，免磁盘排全行） | 覆盖索引全扫 |
| ALL | **全表扫描** | 无索引或索引失效 |

### key / key_len

- `key`：实际选用的索引（possible_keys 只是候选）
- `key_len`：**判断复合索引用了几列**

```sql
KEY idx (name, age)   -- name varchar(20) utf8mb4: 20×4+2=82, age int: 4+1(null)
key_len = 82          -- 只用了 name
key_len = 87          -- name + age 都用上了
```

### rows 与 filtered

- `rows`：优化器预估的扫描行数（基于统计信息，越大越危险）
- `filtered`：经过条件过滤后剩余的百分比，`rows × filtered` ≈ 实际返回量
- 统计信息不准时 `analyze table` 重采样

### Extra 重点值

| 值 | 含义 | 好坏 |
|----|------|------|
| Using index | 覆盖索引，不回表 | ✅ 好 |
| Using index condition | 索引下推 ICP | ✅ 好 |
| Using where | server 层过滤（配合 ALL 常见） | 中性 |
| Using filesort | **额外排序**（无法用索引顺序） | ❌ 需优化 |
| Using temporary | **建临时表**（group by / distinct 无索引） | ❌ 需优化 |
| Using join buffer | 被驱动表连接列无索引（Block Nested Loop） | ❌ 需优化 |
| Impossible where | 条件恒 false | 检查 SQL |

### trace：看优化器怎么选的索引

explain 只给结论（选了哪个索引），**trace 给原因**：优化器评估了哪些候选索引、各自的成本、为什么最终选这个。

```sql
-- 开启 trace（信息量大，只调试时开，用完关闭）
SET optimizer_trace = 'enabled=on';
SET optimizer_trace_max_mem_size = 1000000;

select * from user where name = 'abc';   -- 执行要分析的 SQL

-- 查看结果（JSON，含 cost 计算）
SELECT * FROM information_schema.OPTIMIZER_TRACE\G

SET optimizer_trace = 'enabled=off';     -- 务必关闭，有性能开销
```

JSON 关键字段：

| 字段 | 含义 |
|------|------|
| `rows_estimation` | 各候选索引的扫描行数估算 |
| `cost` | 走索引 vs 全表扫描的成本对比 |
| `chosen` | 是否被选用 |
| `considered_execution_plans` | 评估过的执行计划列表 |

典型用途：**explain 显示没走预期索引时**，用 trace 看优化器成本估算，判断是统计信息过旧（`analyze table`）还是索引成本确实不占优（`force index` 或改写 SQL）。

### 典型优化信号

```
type = ALL                    → 加索引 / 改写条件
key = NULL 且 rows 巨大        → 索引失效（函数、隐式转换、前导 %）
Using filesort                → 排序列加索引（或按联合索引顺序 order by）
Using temporary               → group by 列加索引
Using join buffer             → 被驱动表连接列加索引；小表驱动大表
```

### 总结

```
explain：看计划（type / key / rows / Extra）
explain analyze（8.0+）：计划 + 实际耗时
trace：看优化器选索引的成本决策过程
顺序：explain 定位 → 索引没按预期走时用 trace 挖原因
```

面试要点：type 等级顺序及 ALL/range/ref 的含义、key_len 判断复合索引用几列、filesort 与 temporary 的成因和优化方向、trace 的开关流程与适用场景。

## 常见的 SQL 优化点有哪些？

逐条列出高频优化点，每条都是「问题 → ❌/✅ 对比」。

### 用覆盖索引，避免 select *

```sql
-- ❌ select *：二级索引查到主键后还要回表
select * from user where name = 'abc';

-- ✅ 查询列都在索引里，Extra: Using index，免回表
select id, name from user where name = 'abc';
```

### 遵循最左前缀建索引

```sql
-- 业务查询：where status = 1 and create_time > '2024-01-01'
-- ❌ idx(create_time, status)：范围列在前，status 失效
-- ✅ idx(status, create_time)：等值在前，范围在后
```

- 联合索引按字典序排列，查询条件从最左列连续命中才有效
- 一棵 idx(a,b) 同时服务 `where a` 和 `where a and b`，不必冗余建 idx(a)

### 避免索引失效的写法

```sql
-- ❌ 索引列参与运算
where age + 1 = 20        -- ✅ where age = 19
-- ❌ 索引列套函数
where date(create_time) = '2024-01-01'   -- ✅ where create_time >= '2024-01-01' and < '2024-01-02'
-- ❌ 隐式类型转换（phone 是 varchar）
where phone = 13800000000 -- ✅ where phone = '13800000000'
-- ❌ 前导模糊
where name like '%abc'    -- ✅ where name like 'abc%'
-- ❌ 不等于 / not in / is not null（大概率放弃索引）
where status != 1         -- ✅ 改写为 status in (0, 2) 或拆分查询
```

### 深分页用延迟关联或游标

```sql
-- ❌ limit 1000000, 10：先扫描 1000010 行再丢弃前 100 万
select * from orders order by id limit 1000000, 10;

-- ✅ 延迟关联：先用覆盖索引拿 10 个主键，再回表 10 行
select * from orders t
join (select id from orders order by id limit 1000000, 10) tmp
on t.id = tmp.id;

-- ✅ 游标（记住上次位置，适合连续翻页）
select * from orders where id > 1000000 order by id limit 10;
```

### 小表驱动大表

```sql
-- in：先查小表结果集，再对大表逐个匹配 → 小表在外层
select * from big where key in (select key from small);

-- exists：外层全表逐行进 exists 子查询判断 → 外层应为小表
select * from small s where exists (select 1 from big b where b.key = s.key);
```

- 原则：数据量小的结果集驱动大的，减少外层循环次数
- join 场景同理：小表做驱动表，被驱动表连接列建索引

### join 控制在 3 张表内

- MySQL join 是嵌套循环，表越多成本相乘、执行计划越不稳
- 连接列必须有索引，否则 `Using join buffer`（Block Nested Loop），性能急剧下降
- 超过 3 张表：应用层组装（查主表 → in 批量查关联表 → 内存合并）

### union all 替代 union

```sql
-- ❌ union：需要去重，产生临时表 + 排序
select name from a union select name from b;

-- ✅ union all：不去重直接合并（确定无重复时）
select name from a union all select name from b;
```

### 批量插入代替循环单条

```java
// ❌ 循环单条：1 万次网络往返 + 1 万次事务开销
for (User u : list) userMapper.insert(u);

// ✅ 批量：一次往返（每批 500~1000 条，过大打爆 SQL 长度）
userMapper.insertBatch(list);
```

### count(*) 而非 count(列)

```sql
-- ✅ count(*)：InnoDB 专门优化，不取值，等效 count(1)
select count(*) from orders;

-- ⚠️ count(name)：要判断每行 name 是否为 NULL，最慢
```

### 总结

```
写法层：覆盖索引、避免索引失效、union all、count(*)
索引层：最左前缀、等值在前范围在后
数据量层：深分页延迟关联、小表驱动、批量操作、join 限 3 表
```

面试要点：索引失效的五种写法、深分页两种方案、in 与 exists 的选择依据。



## 如何一次插入大量的数据？

### JDBC 批量写入

关键参数：

```bash
# MySQL JDBC 必须开启，否则 addBatch 仍逐条发送
rewriteBatchedStatements=true
```

| 要点 | 说明 |
|------|------|
| 分批提交 | 每批 500~1000 条；过大打爆 `max_allowed_packet`、undo log 膨胀 |
| 一个事务 | 整批一个事务提交（或分批事务），避免每条一提交 |
| 关闭自动提交 | `conn.setAutoCommit(false)`，最后统一 commit |
| 去掉无关开销 | 插入前删掉不必要的触发器/二级索引，插完再建 |

### load data infile

```sql
-- 文本/csv 数据源，速度最快（绕过 SQL 解析层）
load data local infile '/data/user.csv'
into table user
fields terminated by ','
lines terminated by '\n';
```

- 适合百万级以上的初始化导入，比 insert 快一个量级
- 需 `local_infile=1`（服务端与 JDBC 连接参数 `allowLoadLocalInfile=true`）

### MyBatis 写法

```xml
<!-- ❌ foreach 拼几万条 values：SQL 超长，容易 OOM / 超包 -->
<insert id="insertBatch">
  insert into t(a, b) values
  <foreach collection="list" item="x" separator=",">
    (#{x.a}, #{x.b})
  </foreach>
</insert>
```

- foreach 本质是一条超大 SQL，**必须配合外层分批**（List.partition(1000)）
- 大数据量用 `ExecutorType.BATCH` 模式更稳：

```java
try (SqlSession session = sqlSessionFactory.openSession(ExecutorType.BATCH)) {
    UserMapper mapper = session.getMapper(UserMapper.class);
    for (User u : list) {
        mapper.insert(u);          // 累积到批
        if (++count % 1000 == 0) session.flushStatements();
    }
    session.flushStatements();下·
    session.commit();
}
```

### 全量迁移场景

| 方式 | 适用 |
|------|------|
| `load data infile` | 文件 → 库，百万级以上最快 |
| mysqldump / mydumper | 库 → 库迁移 |
| `insert ... select` | 同实例表复制（注意 binlog 格式影响） |
| canal / DataX 等 | 异构迁移、增量同步 |




## limit 深分页如何优化？

### 问题：limit offset 并不是"跳过"

```sql
select * from orders order by id limit 1000000, 10;
```

- 执行过程：按索引顺序**扫描 1000010 行，丢弃前 100 万行**，返回 10 行
- offset 越大扫描越多，成本线性增长；若排序列无索引还要加 filesort
- 深分页慢的本质：**服务端做了大量无效扫描和丢弃**

### 方案一：游标分页（键集分页）—— 最优

```sql
-- 记住上一页最后的 id，下一页从它之后取
select * from orders where id > 1000000 order by id limit 10;
```

- 走主键/索引直接定位，扫描量恒定为 limit n，与页深无关
- 限制：只能连续翻页（上一页/下一页），**不能跳页**；要求排序列唯一有序
- 适用：App 信息流、滚动加载、ES 的 search_after 同一思想

### 方案二：延迟关联

```sql
-- ❌ 直接查：回表 1000010 次
select * from orders order by id limit 1000000, 10;

-- ✅ 子查询只用覆盖索引拿到 10 个主键，再回表 10 行
select * from orders t
join (select id from orders order by id limit 1000000, 10) tmp
  on t.id = tmp.id;
```

- 子查询在二级索引上完成扫描（不回表），最终只回表 10 次
- 仍要扫索引 100 万项，但扫"瘦索引"比扫"整行"快得多
- 适合：必须支持跳页的场景

### 方案三：条件定位（知道起点 id）

```sql
-- 页面上带真实 id（不是页码），从它开始取
select * from orders where id >= 1000000 order by id limit 10;
```

- 与游标等价，直接索引定位
- 前提：业务能拿到边界 id

### 方案四：业务层限制

- 限制可翻页深度（如最多 100 页），搜索引擎也这么干
- 跳转深页改用搜索/筛选条件缩小范围，而不是翻页

### 方案对比

| 方案 | 扫描量 | 能否跳页 | 要求 |
|------|--------|----------|------|
| limit offset | O(offset + n) | ✅ | 无 |
| 游标分页 | O(n) | ❌ | 排序列唯一有序，记住边界值 |
| 延迟关联 | O(offset + n)（扫瘦索引） | ✅ | 排序列有索引 |
| 业务限制 | - | - | 产品配合 |

### 总结

```
limit 慢的本质：offset 是扫描后丢弃，不是跳过
连续翻页 → 游标（where id > 上次边界）
必须跳页 → 延迟关联（覆盖索引拿 id 再回表）
最好 → 业务限制翻页深度
```

面试要点：limit offset 的执行本质、游标分页的适用与限制、延迟关联为什么快（回表次数从 offset+n 降到 n）。



## 慢查询如何定位？

### 定位流程

```
1. 开启慢日志，抓出慢 SQL
      ↓
2. explain 分析执行计划（type=ALL？索引失效？filesort？）
      ↓
3. show profile / performance_schema 看每阶段耗时
      ↓
4. 定位是 SQL 问题（索引/写法）还是系统问题（IO/CPU/锁等待）
```

### 慢查询日志

```sql
-- 查看配置
show variables like '%slow_query%';

-- 开启并设置阈值（超过 1 秒记入日志）
set global slow_query_log = on;
set global long_query_time = 1;

-- 记录全表扫描的 SQL（即使没超时）
set global log_queries_not_using_indexes = on;
```

日志分析工具：`mysqldumpslow`（自带）、`pt-query-digest`（更详细，按指纹聚合）。

### show profile

```sql
set profiling = on;
select * from orders where ...;   -- 执行要分析的 SQL
show profiles;                    -- 拿到 Query_ID
show profile for query 1;         -- 查看各阶段耗时
```

关注 `Sending data`、`Copying to tmp table`、`sorting result` 等阶段占比。

### 系统层排查

| 现象 | 方向 |
|------|------|
| CPU 高 | 临时表排序、全表扫描、QPS 暴涨 |
| IO 高 | buffer pool 命中率低（`innodb_buffer_pool_read_requests` 与 reads 之比） |
| 大量锁等待 | `select * from performance_schema.data_lock_waits`、`show engine innodb status` |
| 连接堆积 | `show processlist`，慢 SQL 拖住连接池 |

### 总结

```
入口：慢日志抓 SQL（long_query_time）
分析：explain 看计划 → profile 看耗时分布
区分：SQL 自身慢（索引/写法）vs 系统慢（IO/锁/连接）
```

面试要点：慢日志关键参数、定位流程、profile 各阶段含义、buffer pool 命中率判断。



## delete、truncate、drop 的区别？

| 对比项 | delete | truncate | drop |
|--------|--------|----------|------|
| 类型 | DML | DDL | DDL |
| 作用 | 按条件删行（可带 where） | 清空整表数据 | 删除表结构 + 数据 |
| 回滚 | ✅ 走 undo log，可回滚 | ❌ 隐式提交，不可回滚 | ❌ 不可回滚 |
| 速度 | 慢（逐行删 + 记 undo/binlog） | 快（直接重建表空间） | 快 |
| binlog | 记录逐行（ROW 格式） | 记录整表重建 | 记录 drop 语句 |
| 自增值 | 不重置 | 重置为 1 | 表都没了 |
| 触发器 | 触发 | 不触发 | 不触发 |
| where 可选 | ✅ | ❌ | ❌ |

```sql
delete from t where create_time < '2020-01-01';  -- 条件删，可回滚
truncate table t;                                 -- 清空，不可回滚
drop table t;                                     -- 连表结构一起删
```

误删恢复思路：

- delete 误删：binlog（ROW 格式）反向生成 insert 恢复
- truncate/drop：需延时备份、binlog 全量重放到误删前，或用闪回工具（binlog2sql）
- 兜底：定期全量备份 + 实时 binlog

### 总结

```
delete：DML，条件删，慢，可回滚
truncate：DDL，清空表，快，不可回滚，重置自增
drop：DDL，删表结构+数据，不可回滚
```

面试要点：DML 与 DDL 的本质区别、回滚能力的由来（是否走 undo log）、误删数据的三种恢复手段。



## 大表如何安全加字段/索引？

### 直接 DDL 的风险

- 老版本（5.6 前）加字段要**复制全表 + 锁表**，百万大表分钟级不可写
- 5.6+ 的 Online DDL 大幅改善，但部分操作仍需重建表（INPLACE）或短暂锁（如加全文索引）

### Online DDL

```sql
alter table t add column remark varchar(100),
    algorithm=inplace, lock=none;
-- algorithm：copy（复制表，锁写）/ inplace（原表上改）/ instant（8.0+ 只改元数据，秒级）
-- lock：none（不锁）/ shared（锁读）/ exclusive（锁读写）
```

| 操作 | 8.0 支持 |
|------|----------|
| 加列（末尾） | ✅ INSTANT 秒级 |
| 加索引 | ✅ INPLACE 允许并发 DML |
| 修改列类型 | ❌ 只能 COPY，锁表 |
| 删列 | INPLACE |

### 第三方在线变更工具

大表或修改列类型等不支持 online 的操作，用：

| 工具 | 原理 |
|------|------|
| gh-ost（GitHub） | 基于 binlog 同步增量，影子表 + 原子 rename，可限流、可暂停 |
| pt-online-schema-change（Percona） | 触发器捕获增量到影子表 |

共同思路：建影子表 → 拷贝存量数据 → 同步增量 DML → 原子 rename 切换，全程不长时间锁表。

### 操作建议

```
1. 低峰期执行，提前在测试库演练耗时
2. 优先用 8.0 INSTANT / INPLACE；不支持的操作用 gh-ost
3. 大表 DDL 前确认磁盘余量（影子表要占一倍空间）
4. 主从架构：先从后主，控制复制延迟
```

### 总结

```
8.0 加列 INSTANT、加索引 INPLACE，基本在线
改列类型只能 COPY 锁表 → 用 gh-ost 影子表方案
原则：低峰 + 演练 + 留磁盘 + 控延迟
```

面试要点：三种 algorithm 的区别、gh-ost/pt-osc 的影子表原理、主从架构下的 DDL 顺序。

## MySQL 执行 delete 后为什么磁盘空间不释放？

### 原因：delete 只是“标记删除”

- delete 是 DML：InnoDB 只把记录打上**删除标记**（delete bit + 事务 ID），并不真正移除数据
- 这些被标记的记录所在的**页不会归还操作系统**，磁盘上表空间文件（.ibd）大小不变
- 后台 purge 线程清理的也只是记录，空间留给**复用**：
  - 记录级复用：新插入的数据落在同一数据页的空槽
  - 页级复用：整页空了回收给 B+ 树，供同范围数据再利用

**注**：复用是空间不变的根本原因：InnoDB 以页为单位管理，删除产生的“空洞”只供本表复用，**不会收缩文件**——这是为了性能（频繁收缩/扩张文件代价大）。


### 空间对比

| 操作 | 磁盘空间 |
|------|----------|
| delete | 不释放，留下空洞待复用 |
| truncate | 释放（直接重建表空间文件） |
| drop | 释放（删除表空间文件） |

### 碎片的代价

| 问题 | 说明 |
|------|------|
| 空间浪费 | 删得多、插得少 → 碎片越积越多 |
| 性能下降 | 页半空 → 同样数据占更多页 → 缓存命中率低、IO 多 |
| 统计偏差 | 碎片影响统计信息与执行计划 |

### 如何真正释放

```
1. alter table t engine=innodb   -- 重建表：按主键把数据重新紧凑排列（Online DDL）
2. optimize table t              -- 8.0 对 InnoDB 等价于 重建 + analyze
3. 大表用 gh-ost / pt-osc        -- 影子表方案，避免锁表
```

- 查看碎片：`show table status` 的 **Data_free** 字段
- 注意：重建期间需要约一倍额外空间；有长查询/长事务时 MDL 风险同 DDL


## MySQL 的索引下推（ICP）是什么？

**把 where 条件中索引列的过滤下推到存储引擎层**，在索引遍历阶段就过滤掉不满足的行，**减少回表次数**（MySQL 5.6 引入）。

### 没有下推 vs 有下推（联合索引 (name, age)，查询 name like 'B%' and age = 20）

```
无下推（5.6 前）：
  引擎层：按 name 找到所有 'B%' 的索引项（可能 1000 条）
  → 1000 条全部回表取整行
  → server 层再过滤 age = 20（剩 10 条）
  → 白回表了 990 次

有下推（5.6+）：
  引擎层：name like 'B%' 且 age = 20 直接在索引上判断
        （age 就在联合索引里，不用回表）
  → 只有 10 条回表
```

### 触发条件与识别

| 条件 | 说明 |
|------|------|
| 联合索引 | 条件中的列能在**当前索引**里拿到 |
| 无法走索引的部分 | like 'B%'、范围等**只用到前缀**的场景收益最大 |
| 不适用 | 覆盖索引（本来就不回表）；条件列不在索引里 |

- `explain` 的 Extra 显示 **Using index condition** 即生效
- 相关参数：`index_condition_pushdown`（默认开启）




## 深分页如何性能优化？

问题本质：`limit 1000000, 10` 是**扫描 100 万行后丢弃**，offset 越大越慢。

### 四种方案

| 方案 | 做法 | 特点 |
|------|------|------|
| **游标分页**（键集分页） | `where id > 上页边界 order by id limit 10` | 扫描量恒定 O(n)，**最优**；只能连续翻页，不能跳 |
| **延迟关联** | 子查询用覆盖索引只取 10 个主键，再回表 | 支持跳页；仍扫索引但只回表 10 次 |
| **条件定位** | 页面带真实边界 id，`where id >= start limit 10` | 与游标等价 |
| **业务限制** | 限制可翻页深度（如最多 100 页） | 产品层规避 |

### 选型

```
连续翻页（信息流、滚动加载）→ 游标分页
必须跳页 → 延迟关联
最优解 → 业务上限制翻页深度
```

**注**：对应 SQL 优化点里的简版，此处展开：核心都是**让排序过滤在索引上完成**，把"扫描+丢弃"变成"定位+返回"。



## MySQL 中 count(1)、count(*) 与 count(列名) 的区别？

### 语义差异（先分清）

| 写法 | 统计的是 | NULL 行 |
|------|----------|---------|
| `count(*)` | 总行数 | **计入** |
| `count(1)` | 总行数（每行给常量 1） | **计入** |
| `count(列名)` | 该列**非 NULL** 的行数 | 不计入 |

`count(*)` 与 `count(1)` 语义和结果完全相同；`count(列)` 语义不同，**不是同一指标**。

### 性能差异

| 写法 | InnoDB 执行 | 说明 |
|------|-------------|------|
| `count(*)` | **专门优化**：Server 层直接按行累加，不取值不判 NULL | 官方推荐写法 |
| `count(1)` | 与 count(*) 基本等价（也是按行累加常量） | 无差别 |
| `count(主键)` | 取出主键值判 NULL（理论上多一步，实际优化后接近） | 不必特意用 |
| `count(普通列)` | 逐行取列值判断 NULL，**最慢**；若该列有二级索引会走索引 | 有语义需求才用 |

- 三者都会选**最小的索引树**扫描（能覆盖就 `Using index`），有更小的二级索引时比扫主键快
- MyISAM 的 count(*) 是 O(1)（表级总行数变量）；**InnoDB 因 MVCC 不同时刻行数不同，必须实扫**

### 为什么 InnoDB 不像 MyISAM 存总行数

- MVCC：不同事务同一时刻看到的行数不一样，无法存一个全局正确值
- `show table status` 的 Rows 只是**估算值**（统计信息），可用来粗略代替大表 count

### 大表 count 慢的优化

| 方案 | 说明 |
|------|------|
| 计数表 | 单独维护一张计数表，增删改时同事务更新（精确） |
| explain 估算 | `explain` 的 rows 字段近似值（允许误差的场景） |
| Redis 计数 | 计数与落库一致性要自己保证（对账兜底） |

**注**：结论一句话：**数行数用 count(*)（官方优化最好），count(列) 是另一个语义（非 NULL 计数）别混用**；大表精确计数靠计数表，允许误差用估算。

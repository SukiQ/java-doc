---
title: 日志
---

# 日志


## redo log、undo log、binlog 的区别？


<img src="/pictures/18.png" alt="7" style="zoom:30%;" />

| 对比 | redo log | undo log | binlog |
|------|----------|----------|--------|
| 层级 | InnoDB 引擎层 | InnoDB 引擎层 | Server 层（所有引擎都有） |
| 内容 | **物理日志**：某页某处改成了什么 | **逻辑日志**：反向操作（insert↔delete） | **逻辑日志**：语句或行变更 |
| 作用 | **崩溃恢复**（持久性 D） | **回滚**（原子性 A）+ MVCC 版本链 | **主从复制、数据恢复**（归档） |
| 写入方式 | 固定大小，**循环写**（write pos 追 check point） | 随事务写，提交后待 purge | **追加写**，写满换文件 |
| 刷盘时机 | `innodb_flush_log_at_trx_commit`（0/1/N） | 随事务 | `sync_binlog`（0/1/N） |

### Redo log

InnoDB 采用先写日志再写内存的策略。当数据修改时，先将对数据页的修改记录到 Redo Log 中，此时事务就算成功了。
即使随后数据库崩溃，重启后也可以通过 Redo Log 把“未刷盘到磁盘的数据页”重新恢复出来。
采用环形方式循环写，写满后会覆盖最旧的日志

### Undo log

在事务修改数据之前，会先把原始数据记录到 Undo Log 中。如果事务执行过程中出错调用了 ROLLBACK，或者数据库崩溃需要回滚，就可以利用 Undo Log 中的逆向操作将数据恢复到修改前


### Binlog

Binlog 是 MySQL Server 层自带的日志，任何对数据库有修改行为的操作（**无论成功与否**），都会在事务提交时被记录到 Binlog 中

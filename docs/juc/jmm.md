---
title: JMM 并发模型
---

# JMM 并发模型


## 什么是可见性？

可见性是指：**一个线程对共享变量的修改，其他线程能否及时看到**。

### 为什么会有可见性问题？

每个线程有自己的**工作内存（CPU 缓存 / 寄存器）**，不会直接读写主内存：

<img src="/pictures/7.png" alt="7" style="zoom:50%;" />

- 线程 A 修改变量后，可能只写到寄存器，未及时刷新到主内存
- 线程 B 读取时可能读到旧值，看不到 A 的修改

### 解决方案

#### volatile

- 保证可见性：写入时立即刷新到主内存，读取时从主内存加载
- 禁止指令重排序：通过内存屏障实现
- **不保证原子性**：`i++` 仍可能出错

#### synchronized

- 进入同步块前读主内存，退出前写回主内存
- 同时保证**可见性 + 原子性**
- 开销比 volatile 大

### volatile vs synchronized

| 对比 | volatile | synchronized |
|------|----------|--------------|
| 可见性 | ✅ | ✅ |
| 原子性 | ❌ | ✅ |
| 阻塞 | 不阻塞 | 阻塞 |
| 性能 | 轻量 | 较重 |
| 适用 | 状态标志、单次读写 | 复合操作、临界区 |



## 什么是有序性？

有序性是指：**程序执行的顺序是否符合代码编写的顺序**。编译器和 CPU 为了优化性能，会对指令进行重排序，在单线程下不影响结果，但在多线程下可能出问题。

#### volatile

- 通过**内存屏障**禁止指令重排序
- 写屏障：前的写操作不会被重排到后面
- 读屏障：后的读操作不会被重排到前面
- 上述单例问题加 `volatile` 即可解决

#### synchronized

- 保证同步块内代码的原子性，但**不能完全防止重排序**
- 进入和退出同步块时的 happens-before 关系保证可见性

#### happens-before 规则

JMM 定义的一组偏序关系，前一个操作的结果对后一个操作可见：

| 规则 | 说明 |
|------|------|
| 程序次序规则 | 同一线程内，按代码顺序前面的操作 happens-before 后面的 |
| 锁规则 | unlock happens-before 后续对同一把锁的 lock |
| volatile 规则 | volatile 写 happens-before 后续对同一变量的读 |
| 传递性 | A happens-before B，B happens-before C，则 A happens-before C |
| 线程启动规则 | `start()` happens-before 线程内所有操作 |
| 线程终止规则 | 线程内所有操作 happens-before `join()` 返回 |

#### as-if-serial 规则

- 含义：无论怎么重排序，**单线程程序的执行结果不变**
- 编译器和 CPU 只会重排无数据依赖的指令，有依赖的保持顺序
- 属于对程序员的**单线程视角保证**：程序员无需感知重排序的存在

| 对比 | as-if-serial | happens-before |
|------|--------------|----------------|
| 作用范围 | 单线程 | 多线程 |
| 保证内容 | 执行结果不变 | 前一操作的可见性 |
| 重排序 | 允许无依赖重排 | 通过规则禁止跨线程的重排 |
| 关系 | 是 happens-before 程序次序规则的基础 | 是 as-if-serial 在多线程的扩展 |



## 什么是内存屏障？

内存屏障（Memory Barrier）是一条 CPU 指令，**禁止屏障两侧的指令重排序，并强制刷新/加载缓存**，是 volatile、锁等同步语义的底层实现。

### 四种屏障

| 屏障类型 | 说明 |
|----------|------|
| **LoadLoad** | 屏障前的读操作完成后，才执行屏障后的读操作 |
| **StoreStore** | 屏障前的写操作全部刷新到主内存后，才执行屏障后的写操作 |
| **LoadStore** | 屏障前的读操作完成后，才执行屏障后的写操作 |
| **StoreLoad** | 屏障前的写操作全部刷新后，才执行屏障后的读操作，**开销最大** |

### 屏障的作用

1. **禁止指令重排序**：屏障两侧的指令不能互相穿插
2. **强制缓存同步**：写屏障把工作内存的修改刷到主内存，读屏障使工作内存缓存失效，从主内存重新加载

### volatile 的屏障策略

JMM 对 volatile 的保守插入策略：

| 场景 | 插入的屏障 |
|------|------------|
| volatile 写**前** | StoreStore 屏障 |
| volatile 写**后** | StoreLoad 屏障 |
| volatile 读**后** | LoadLoad + LoadStore 屏障 |

效果：

```
普通写            ┐
                 StoreStore  ← 保证前面写先完成
volatile 写 = x  ┘
                 StoreLoad   ← 保证写对后续读可见
普通读            
                 LoadLoad    ← 保证 volatile 读先于后续读
                 LoadStore   ← 保证 volatile 读先于后续写
```

这就解释了 volatile 为什么能保证可见性和有序性。

### x86 上的实现

- x86 只允许 StoreLoad 重排序，所以 volatile 写只需一条 `lock addl $0,(rsp)` 指令（同时充当 StoreLoad 屏障并刷新缓存）
- 其他架构（如 ARM）弱内存模型，需要更多屏障指令
- 这也是 x86 上 volatile 读几乎无开销、写开销略大的原因

### 与上层语义的对应

| 上层语义 | 底层依赖 |
|----------|----------|
| volatile 可见性 | 写屏障刷新缓存 + 读屏障失效缓存 |
| volatile 有序性 | LoadLoad / StoreStore 等禁止重排 |
| synchronized | monitor enter/exit 隐含屏障（lock 前缀指令） |
| CAS（Atomic 类） | `lock cmpxchg` 指令自带全屏障效果 |
| final 字段安全 | 构造函数结束时的 StoreStore 屏障 |

### 总结

```
内存屏障 = CPU 指令
作用：禁止重排序 + 强制缓存同步
四种：LoadLoad / StoreStore / LoadStore / StoreLoad
应用：volatile、synchronized、CAS 的底层实现
```

面试要点：屏障的两种作用（禁重排 + 缓存同步）、四种屏障类型、volatile 的屏障插入策略。

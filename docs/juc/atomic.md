---
title: 原子类
---

# 原子类


## LongAdder 累加器

`LongAdder` 是 JDK 8 引入的累加器，用于替代高并发下的 `AtomicLong`，核心思路是**热点分离：把一个 value 拆成多个 Cell 分散压力**。

### AtomicLong 的问题

- `AtomicLong.incrementAndGet()` 基于 **CAS 自旋**
- 高并发下大量线程同时竞争同一个 value，CAS 失败率高，反复自旋浪费 CPU

```
线程1 ──CAS──→ value（唯一热点）
线程2 ──CAS──↗
线程3 ──CAS──↗   大量失败重试
```

### LongAdder 的原理

内部维护 `base + Cell[] 数组`：

```
线程1 ──CAS──→ Cell[0]
线程2 ──CAS──→ Cell[1]     每个线程映射到不同 Cell
线程3 ──CAS──→ Cell[2]     竞争分散，失败率低
                 ↓
sum() = base + Σ Cell[i]   需要时才汇总
```

- **add()**：优先 CAS 到 base，失败则映射到某个 Cell 上 CAS，还失败换 Cell 重试
- **sum()**：遍历所有 Cell 求和，**非原子快照**（遍历时可能仍在变化）
- Cell 数量受 CPU 核数限制（最多略多于核数），用 `@Contended` 避免**伪共享**

### 对比

| 对比项 | AtomicLong | LongAdder |
|--------|------------|-----------|
| 原理 | 单值 CAS 自旋 | base + Cell[] 分散 CAS |
| 写性能（低并发） | 相当 | 相当 |
| 写性能（高并发） | 差（自旋浪费） | 好（数量级提升） |
| 读性能（sum） | O(1)，精确 | 遍历求和，**非精确快照** |
| CAS 失败 | 自旋重试 | 换 Cell 重试 |
| 内存 | 一个 long | base + 数组，略多 |
| 适用 | 需要精确即时值 | 统计计数的最终值 |

### 使用示例

```java
LongAdder counter = new LongAdder();

// 并发累加
counter.increment();   // 等价 add(1)
counter.add(100);

// 读取总数（时刻可能不准，最终一致）
long total = counter.sum();
```

### 伪共享与 @Contended

- CPU 缓存以缓存行（通常 64 字节）为单位，多个 Cell 挤在同一缓存行时，一个 Cell 的修改会使其他 Cell 的缓存失效
- `Cell` 类标注 `@Contended`，JVM 会自动填充（padding），让每个 Cell 独占一个缓存行
- 需要 JVM 参数 `-XX:-RestrictContended` 才对用户类生效（JDK 内部类默认生效）

### 什么时候用哪个？

| 场景 | 选择 |
|------|------|
| 高并发统计计数（QPS、调用次数），最终读一次 | **LongAdder** |
| 需要随时精确读取当前值，或做 getAndAdd 等复合操作 | **AtomicLong** |
| 需要比较并交换（`compareAndSet`） | **AtomicLong**（LongAdder 不支持） |



## 什么是 ABA 问题？

CAS 只比较**值**是否相等，不感知**变化过程**。值从 A 改成 B 又改回 A，CAS 认为没变过，实际已经被修改了两次。

### 解决方案

#### AtomicStampedReference（版本号）

- 在值之外附加一个 **stamp（版本号）**，每次修改 stamp +1
- CAS 时同时比较 `值 + 版本号`，值改回 A 但版本号变了，CAS 失败

```java
AtomicStampedReference<Integer> ref =
    new AtomicStampedReference<>(100, 0);  // 初始值 100，版本 0

int stamp = ref.getStamp();                // 记住当前版本
ref.compareAndSet(100, 50, stamp, stamp + 1);   // 值和版本都要匹配
// 即使值改回 100，版本已变，旧版本 CAS 会失败
```

#### AtomicMarkableReference（标记位）

- 把版本号简化为一个 **boolean 标记**（是否被改过）
- 只关心"动没动过"，不关心动了几次，开销比版本号小

| 对比 | AtomicStampedReference | AtomicMarkableReference |
|------|------------------------|-------------------------|
| 附加信息 | int 版本号，可记录次数 | boolean 标记，只有两种状态 |
| 适用 | 需要知道变化次数 / 严格判断 | 只需判断是否被修改过 |

#### 其他思路

- 加锁：`synchronized` / `ReentrantLock`，直接规避 CAS 的判断盲区
- 不可变对象：值一旦创建不被修改（改 = 换新对象），天然无 ABA
- 数据库场景：乐观锁的 `version` 字段就是版本号思路

### 注意

- 大多数业务场景（纯计数、状态标志）不必处理 ABA
- 只有**依赖"未被修改"这一前提做复合逻辑**（无锁链表/栈、按旧值推导新值）时才必须处理

### 总结

```
ABA = 值改回原样，CAS 感知不到中间变化
危害：依赖"没动过"做判断的逻辑会出错
解决：版本号（Stamped）/ 标记（Markable）/ 加锁 / 不可变
```

面试要点：ABA 的成因（CAS 只比值）、何时有害（引用/复合状态，纯数值无害）、AtomicStampedReference 的版本号机制。

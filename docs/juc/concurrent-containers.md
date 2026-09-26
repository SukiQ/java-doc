---
title: 并发容器
---

# 并发容器


## ConcurrentHashMap 的实现原理？

### JDK 7：分段锁（Segment）

```
ConcurrentHashMap
  └── Segment[]（默认16段，每段是一个小 HashMap，继承 ReentrantLock）
        └── HashEntry[]（链表）
```

- 写操作锁住**一个 Segment**，不同段并发写互不影响
- 并发度 = Segment 数量（默认 16），初始化后不可扩容段
- 问题：内存浪费、定位两次 hash（先找段再找桶）

### JDK 8：CAS + synchronized 锁桶头

```
Node[] table（与 HashMap 相同的数组 + 链表/红黑树）
写某个桶：
  桶为空      → CAS 插入，无锁
  桶不为空    → synchronized 锁住该桶的头节点，只锁这一个桶
```

- 粒度从"段"细化到"桶"，并发度大幅提升
- 结构与 HashMap 一致：链表长度 ≥8 且数组 ≥64 转红黑树
- 锁的层级：`synchronized`（JDK 6 后有锁升级优化）+ CAS，不再用 ReentrantLock

### 关键机制

#### get() 无锁

- `Node.val` 和 `next` 用 `volatile` 修饰，读总能看到最新值
- 读不加锁，靠内存可见性保证

#### size()：baseCount + CounterCell

- 无全局锁，借鉴 LongAdder：计数分散到 `CounterCell[]`
- `size() = baseCount + Σ CounterCell`，弱一致（非精确快照）

#### 扩容：多线程协助迁移

- 发现正在扩容（ForwardingNode，hash=MOVED），帮忙迁移自己的桶再继续操作
- 迁移完的桶放 ForwardingNode，读写自动转到新表

#### 为什么 key 和 value 都不允许 null？

- **二义性无法消除**：`get(key)` 返回 null，分不清是"不存在"还是"值就是 null"
- HashMap 单线程可以用 `containsKey` 复核；并发下复核的间隙可能被其他线程改掉，**结果不可信**
- 用 `containsKey` 前后两次判断在并发下不成立，所以干脆禁止

### 与 HashMap / Hashtable 对比

| 对比项 | HashMap | Hashtable | ConcurrentHashMap |
|--------|---------|-----------|---------------------|
| 线程安全 | ❌ | ✅ 全表一把锁 | ✅ 桶级锁 |
| null key/value | 允许 1 个 null key | ❌ | ❌ |
| 性能 | 最高（单线程） | 差（全锁） | 高（细粒度） |
| 迭代 | fail-fast | fail-fast | **弱一致**（迭代期间可读到部分修改） |
| 复合操作 | 需自己加锁 | 需自己加锁 | `putIfAbsent` / `computeIfAbsent` 原子 |

```java
// 原子复合操作：并发下"没有才放"不会重复创建
map.computeIfAbsent(key, k -> loadFromDb(k));
```

### 总结

```
JDK7：Segment 分段锁，并发度 = 段数
JDK8：空桶 CAS + 非空桶 synchronized 锁头节点，并发度 = 桶数
读无锁（volatile），size 用 CounterCell 弱一致，扩容多线程协助
null 禁止：并发下 containsKey 复核不可信，二义性无法消除
```

面试要点：JDK7 vs JDK8 锁粒度演变、get 为什么无锁、size 的 LongAdder 思路、null 二义性、computeIfAbsent 原子复合操作。



## CopyOnWriteArrayList 的原理？

**写时复制**：修改时复制一份新数组改，改完把引用指向新数组；读永远读旧数组，无锁。

### 读写行为

```
读线程 ──→ array（当前数组，无锁，volatile 读）
写线程 ──→ 复制 array 副本 → 修改副本 → array = 新数组（ReentrantLock 保护写过程）
```

```java
// add 的核心逻辑
public boolean add(E e) {
    final ReentrantLock lock = this.lock;
    lock.lock();                       // 写与写互斥
    try {
        Object[] es = getArray();
        int len = es.length;
        es = Arrays.copyOf(es, len + 1);   // 复制新数组
        es[len] = e;                       // 在副本上改
        setArray(es);                      // 替换引用（volatile 写）
        return true;
    } finally {
        lock.unlock();
    }
}

// 读：直接拿当前引用，无任何锁
public E get(int index) {
    return elementAt(getArray(), index);
}
```

### 特点

| 维度 | 说明 |
|------|------|
| 读性能 | 无锁，接近裸数组；读多场景极快 |
| 写性能 | 每次复制整个数组，O(n)，写的代价随容量线性增长 |
| 一致性 | **弱一致**：迭代器拿到的是创建那一刻的快照，迭代期间的修改不可见（不会 ConcurrentModificationException） |
| 内存 | 写瞬间内存翻倍（旧数组 + 新数组同时存在） |

### 适用与不适用

| 场景 | 是否适合 |
|------|----------|
| 监听器列表、黑白名单、配置表：读极多、改极少 | ✅ 最合适 |
| 写频繁 / 大列表 | ❌ 复制成本高，内存压力大 |
| 需要强一致读 | ❌ 读到的是快照 |
| 高频写 + 通用场景 | 用 `ConcurrentHashMap` / `Collections.synchronizedList` 替代 |

相关：`CopyOnWriteArraySet` 基于它实现（去重靠 contains，O(n)）。

### 总结

```
读：无锁，volatile 读当前数组
写：加锁 → 复制副本 → 改 → 换引用
定位：读多写少的小容器（监听器、配置）
代价：写 O(n) 复制、内存翻倍、弱一致迭代
```

面试要点：写时复制的流程、为什么迭代不会 ConcurrentModificationException、读多写少定位、写代价与内存代价。

---
title: 集合框架
---

# 集合框架


## Java 常用集合有哪些？它们的区别是什么？

<img src="/pictures/12.png" alt="12" style="zoom: 33%;" />



### List

| 对比 | ArrayList | LinkedList | Vector |
|------|-----------|------------|--------|
| 底层 | 动态数组 | 双向链表 | 动态数组 |
| 随机访问 | **O(1)** | O(n) | O(1) |
| 中间插删 | O(n) | 定位 O(n) + 改指针 O(1) | O(n) |
| 线程安全 | 不安全 | 不安全 | 安全（全方法 synchronized，性能差） |
| 扩容 | 1.5 倍 | 无需 | 2 倍 |
| 定位 | **默认首选** | 头尾插删、当队列 | 已淘汰 |



### Set

| 对比 | HashSet | LinkedHashSet | TreeSet |
|------|---------|---------------|---------|
| 底层 | HashMap（value 是固定对象） | LinkedHashMap | TreeMap（红黑树） |
| 顺序 | 无序 | **插入顺序** | **排序**（自然/Comparator） |
| 增删查 | O(1) | O(1) | O(log n) |
| null | 允许 1 个 | 允许 1 个 | 不允许（比较会 NPE） |
| 适用 | 去重默认选择 | 去重 + 保序 | 去重 + 排序/范围查找 |



### Queue/Deque

| 实现 | 底层 | 适用 |
|------|------|------|
| **ArrayDeque** | 循环数组 | **栈和队列的首选**，比 LinkedList 快且省内存 |
| LinkedList | 双向链表 | 也实现了 Deque，但基本被 ArrayDeque 取代 |
| PriorityQueue | 二叉小顶堆 | 取最值场景（topK、任务调度），出队 O(log n) |



### Map

| 对比 | HashMap | LinkedHashMap | TreeMap | Hashtable | ConcurrentHashMap |
|------|---------|---------------|---------|-----------|-------------------|
| 底层 | 数组+链表+红黑树 | +双向链表 | 红黑树 | 哈希表 | 桶级锁 |
| 顺序 | 无序 | 插入序/访问序 | key 排序 | 无序 | 无序 |
| null key/value | 都允许 | 都允许 | 不允许 | 都不允许 | 都不允许 |
| 线程安全 | 不安全 | 不安全 | 不安全 | 安全（全表锁） | 安全 |
| 特点 | 默认首选 | **LRU 缓存**（accessOrder+removeEldest） | 范围查询 | 老古董 | 并发场景 |



## HashMap 的底层实现？

JDK 8 的 HashMap = **数组 + 链表 + 红黑树**。

### 整体结构

<img src="/pictures/11.png" alt="11" style="zoom:50%;" />

### 核心流程

put 流程：

1. 计算 hash
2. 定位桶
3. 桶为空：直接放入
4. 桶不为空：key 相同（`==` 或 equals）→ 覆盖；树节点 → 红黑树插入；链表 → 尾插到链尾
5. 树化判断：链长 ≥ 8 且 table ≥ 64 才转红黑树
6. 扩容判断：size > 容量 × 0.75（负载因子）→ resize

get 流程：同 hash 定位桶 → 链表/树中用 equals 匹配





## 什么是 hashCode？

`Object` 的 native 方法，返回一个 int 哈希码，把任意对象映射成一个整数，**确定该对象在哈希表中的索引位置**，可用于哈希容器（HashMap/HashSet）分桶定位的依据。

**提示**：hashCode 的筛选逻辑与**布隆过滤器**同构：**hashCode 不相等 → 对象一定不相等**（直接排除，不用比 equals）；**hashCode 相等 → 可能相等**（哈希冲突，再用 equals 复核）





## HashMap 和 HashTable 的区别？

| 对比 | HashMap | Hashtable |
|------|---------|-----------|
| 线程安全 | 非线程安全 | 线程安全（锁整张表） |
| null | 允许 1 个 null key、多个 null value | key、value 都**不允许 null**（NPE） |
| 初始容量/扩容 | 16，2 倍扩容 | 11，2 倍 + 1 扩容 |
| 底层 | 数组 + 链表 + 红黑树（JDK 8） | 数组 + 链表（无树化） |
| 性能 | 高（无锁） | 差（全表锁，竞争激烈时排队） |
| 出现版本 | JDK 1.2 | JDK 1.0 |
| 替代 | 并发用 ConcurrentHashMap | 已淘汰 |



## ConcurrentHashMap 的原理？

JDK 8 的核心：**CAS + synchronized 锁桶头**，把锁粒度做到"单个桶"。

| 要点 | 说明 |
|------|------|
| 写入 | 桶为空 → **CAS** 无锁插入；桶不为空 → **synchronized 锁该桶头节点**再链表/红黑树操作 |
| 读取 | **完全无锁**：Node 的 val、next 用 volatile 保证可见性 |
| size | baseCount + CounterCell 分散计数（LongAdder 思路），**弱一致** |
| 扩容 | 多线程**协助迁移**（发现 ForwardingNode 就帮忙搬自己的桶） |
| null | key、value 都禁止（并发下 null 二义性无法消除） |
| 复合操作 | `putIfAbsent` / `computeIfAbsent` 原子完成"没有才放" |

**注**：JDK 7 是 Segment 分段锁（并发度 = 段数 16）；JDK 8 细化到桶级。与 HashMap/Hashtable 的对比、size 与扩容细节见 JUC 并发容器模块的同名题。

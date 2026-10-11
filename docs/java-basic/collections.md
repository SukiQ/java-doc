---
title: 集合
---

# 集合


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


::: tip
Vector的替代方案:
- Collections.synchronizedList（适合读多写少）
- CopyOnWriteArrayList（适合读非常多、写很少）
:::

### Set

| 对比 | HashSet | LinkedHashSet | TreeSet |
|------|---------|---------------|---------|
| 底层 | HashMap（value 是固定对象） | LinkedHashMap | TreeMap（红黑树） |
| 顺序 | 无序 | **插入顺序** | **排序**（自然/Comparator） |
| 增删查 | O(1) | O(1) | O(log n) |
| null | 允许 1 个 | 允许 1 个 | 不允许（比较会 NPE） |
| 适用 | 去重默认选择 | 去重 + 保序 | 去重 + 排序/范围查找 |

::: tip
TreeSet 特有方法：
- floor(e) / ceiling(e)：≤ / ≥ e 的最近元素
- higher(e) / lower(e)：严格大于 / 严格小于 e 的最近元素
- subSet / headSet / tailSet：范围切片
:::



### Queue/Deque

| 对比 | **ArrayDeque** | LinkedList | PriorityQueue | ArrayBlockingQueue | LinkedBlockingQueue | SynchronousQueue | DelayQueue |
|------|-----------|------------|---------------|--------------------|---------------------|------------------|------------|
| 底层 | 循环数组 | 双向链表 | 二叉小顶堆 | 循环数组，有界 | 链表，默认无界 | 不存元素 | 堆 + 到期时间 |
| 线程安全 | 否 | 否 | 否 | **是（阻塞）** | **是（阻塞）** | **是（阻塞）** | **是（阻塞）** |
| 定位 | **栈和队列的首选**，快且省内存 | 被 ArrayDeque 取代 | 取最值（topK），出队 O(log n) | 一把锁 | 两把锁读写分离吞吐高，无界警惕 OOM | 直接交给消费者 | 到期才能取（延时任务） |



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

### hash 扰动函数

```java
hash = (h = key.hashCode()) ^ (h >>> 16)   // 高 16 位异或低 16 位
index = (n - 1) & hash                     // n 为 2 的幂，等价取模但更快
```

容量小（16）时只有低 4 位参与定位，高位变化全被丢弃；扰动把**高位信息混进低位**，让分布更均匀、减少碰撞。

### 核心流程

put 流程：

1. 计算 hash
2. 定位桶
3. 桶为空：直接放入
4. 桶不为空：key 相同（`==` 或 equals）→ 覆盖；树节点 → 红黑树插入；链表 → 尾插到链尾
5. 树化判断：链长 ≥ 8 且 table ≥ 64 才转红黑树
6. 扩容判断：size > 容量 × 0.75（负载因子）→ resize

get 流程：同 hash 定位桶 → 链表/树中用 equals 匹配

### 扩容 resize

- 触发：size > 容量 × 0.75 → 容量、阈值翻倍，单次 O(n)、均摊 O(1)
- **不重新计算 hash**：JDK 8 把每条链按 `hash & oldCap` 拆成 lo/hi 两条——结果为 0 留**原位置**，否则去**原位置 + oldCap**，链表相对顺序不变

### 树化与退化

- 链长 ≥ 8 且 table ≥ 64 → 转红黑树；table < 64 时**优先扩容**而不是树化
- 扩容拆分或删除后节点 ≤ 6 → 退化回链表（比 8 小留缓冲，防止在 8 附近反复增删来回变换）
- 阈值为什么是 8：正常散列下链长服从泊松分布，到 8 的概率约**千万分之六**——树化只是哈希劣化（打碰撞攻击）的兜底，不是常态

### JDK 7 vs JDK 8

| 对比 | JDK 7 | JDK 8 |
|------|-------|-------|
| 结构 | 数组 + 链表 | 数组 + 链表 + 红黑树 |
| 插入方式 | 头插 | 尾插 |
| 并发扩容 | 头插逆序 → 链表**成环死循环** | 拆分不成环，但 put 仍会**相互覆盖丢数据** |
| 扩容 | 全部 rehash 重算位置 | hash & oldCap 二选一，留在原位或原位 + oldCap |

### 为什么线程不安全

- JDK 7：并发扩容 + 头插 → 链表成环，下次 get **死循环**（CPU 100%）
- JDK 8：改尾插不成环了，但并发 put 仍会**覆盖丢数据**，`++size` 也不精确
- 迭代 fail-fast：迭代中结构被改，抛 ConcurrentModificationException（modCount 检测）
- 需要并发 → ConcurrentHashMap（CAS + synchronized 锁桶头，见 JUC 并发容器）


## ArrayDeque 和 LinkedList 的区别？

| 对比 | ArrayDeque | LinkedList |
|------|-----------|------------|
| 底层 | 连续数组 | 双向链表（每元素多一个节点对象 + 前后两个指针） |
| 内存 | 紧凑、CPU 缓存友好 | 分散、额外开销大、GC 压力大 |
| 两端操作 | 均摊 O(1)，无对象创建 | O(1) 但每次插删 new/free 节点，常数更大 |


::: warning
**结论**：**栈和队列默认选 ArrayDeque**（JDK 官方文档推荐），LinkedList 只在还需要 List 语义时考虑。
:::



## Set 如何保证元素不重复的？

HashSet 底层就是 **HashMap**（元素作 key，value 是固定占位对象），add 即 put，靠 **hashCode + equals 双重判断**：

```
add(e) → hash 定位桶
  桶为空     → 直接放入
  桶不为空   → hash 相等 且（== 同引用 或 equals 相等）→ 判定重复，不插入
```

| 追问 | 答案 |
|------|------|
| 只重写 equals | 两个"相等"对象 hashCode 不同 → 落不同桶 → **判重失效** |
| 只重写 hashCode | 落同桶但 equals 为 false → 仍被当成不同元素 |
| TreeSet 呢 | 不用 hashCode/equals，靠 **compareTo/compare 返回 0** 判重（比较相等即重复） |



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

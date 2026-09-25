# 线程基础


## 什么是 CPU 时间片？

CPU 时间片是操作系统分配给每个线程/进程的**一段连续 CPU 执行时间**。现代操作系统通过时间片轮转（Round-Robin）调度，让多个任务"看起来"同时运行。

### 核心概念

| 概念 | 说明 |
|------|------|
| **时间片** | OS 分配给线程的一段 CPU 时间（通常 10~100ms） |
| **时间片轮转** | 每个就绪线程轮流获得一个时间片执行，用完切到下一个 |
| **上下文切换** | 切换线程时保存当前状态、加载下一个线程状态的过程 |
| **并发** | 多线程交替使用 CPU，同一时刻只有一个在执行 |
| **并行（Parallel）** | 多核 CPU 上多个线程真正同时执行 |

### 上下文切换的开销

切换线程时 OS 需要：

1. 保存当前线程的寄存器、程序计数器、栈状态到 PCB/TCB
2. 加载下一个线程的状态
3. TLB / CPU 缓存可能失效，产生冷启动开销

**单次切换约 5~10μs**，高频切换会显著降低吞吐量。减少上下文切换是性能优化的常见方向。

### 线程数建议

- **CPU 密集型（高并发，低阻塞）**：线程数 ≈ CPU 核数 + 1，减少切换
- **IO 密集型（低并发，高阻塞）**：线程数 ≈ CPU 核数 × (1 + 等待时间/计算时间)，让 CPU 在 IO 等待时不闲着



## 什么是 Java 虚拟线程？

虚拟线程（Virtual Thread）是 JDK 21 正式引入的轻量级线程，由 JVM 在用户态调度。核心价值：**用同步代码风格写高并发，替代响应式编程的复杂度**。

### 平台线程 vs 虚拟线程

| 对比项 | 平台线程 | 虚拟线程 |
|--------|----------|----------|
| 映射 | 1:1 对应 OS 线程 | N:M，由 JVM 调度到载体线程 |
| 栈内存 | 固定 ~1MB | 按需分配，初始几百字节 |
| 数量上限 | 几千 | 百万级 |
| 创建成本 | 系统调用，较重 | 普通 Java 对象 |
| 阻塞行为 | 阻塞 OS 线程，浪费 CPU | 让出载体线程，不浪费 |
| 切换成本 | OS 上下文切换（μs 级） | 用户态切换（ns 级） |
| 适用 | CPU 密集型 | IO 密集型 |

### 工作原理

```
百万级虚拟线程
      │ 挂载到
      ▼
载体线程（Carrier，默认 CPU 核数个 ForkJoinPool）
      │ 1:1
      ▼
OS 线程
```

- 虚拟线程执行到阻塞操作（IO、sleep、Lock）时，JVM 把它的栈帧**拷到堆上**，释放载体线程
- 阻塞结束后，重新挂载到任意空闲载体线程继续执行
- 开发者无感知，写法仍是普通同步代码

### 基本用法

```java
// 方式一：直接启动
Thread.startVirtualThread(() -> {
    var resp = httpClient.send(req, BodyHandlers.ofString());
    db.save(resp.body());
});

// 方式二：ExecutorService
try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
    exec.submit(() -> handle(socket));
}
```

### 注意事项

- 虚拟线程不是"更快"，而是"更多"：单线程执行速度与平台线程相当
- 用完即弃，**不要池化**虚拟线程
- `ThreadLocal` 大量使用会导致内存膨胀，JDK 21 推荐 `ScopedValue` 替代
- 不要用它跑 CPU 密集任务



## 线程中断方法有哪些？

| 方法 | 所属 | 作用 | 是否清除中断标志 |
|------|------|------|------------------|
| `thread.interrupt()` | 实例方法 | 设置该线程的中断标志为 true | 否（设置标志） |
| `Thread.interrupted()` | 静态方法 | 检查**当前线程**的中断标志 | ✅ 会清除为 false |
| `thread.isInterrupted()` | 实例方法 | 检查该线程的中断标志 | ❌ 不清除 |

### 核心区别

- **`interrupt()`**：动作，通知线程"该中断了"，只设置标志位，不强制停止线程。线程是否响应、如何响应由线程自身逻辑决定
- **`interrupted()`**：查询，检查当前线程是否被中断，**查完即清除**。适合线程在循环中自检中断信号，读完就重置，避免后续误判
- **`isInterrupted()`**：查询，检查指定线程是否被中断，**不清除**。适合外部观察某个线程的中断状态

### 代码示例

```java
Thread t = new Thread(() -> {
    // interrupted() 查当前线程，查完清除
    while (!Thread.interrupted()) {
        // 正常干活
    }
    // 走到这里说明被中断了，且标志已清除
});
t.start();
t.interrupt();  // 设置中断标志
```

### 阻塞方法的特殊行为

`sleep` / `wait` / `join` 等阻塞方法在检测到中断标志时：

1. **清除中断标志**（置回 false）
2. 抛出 `InterruptedException`
3. 线程被唤醒

因此捕获 `InterruptedException` 后如果还想保持中断语义，通常需要再次 `interrupt()` 补回标志：

```java
try {
    Thread.sleep(1000);
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();  // 补回中断标志
    // 处理退出逻辑
}
```



## wait 和 sleep 的区别？

两者都能让线程暂停，但**设计目的完全不同**：`wait` 用于线程间协作，`sleep` 用于单纯延时。

### 对比

| 对比项 | wait() | sleep() |
|--------|--------|---------|
| 所属类 | `Object` | `Thread` |
| 释放锁 | ✅ 释放 monitor 锁 | ❌ 抱着锁睡 |
| 前提条件 | 必须在 `synchronized` 内调用（持有锁），否则抛 `IllegalMonitorStateException` | 无要求，任意位置 |
| 唤醒方式 | `notify` / `notifyAll` / 超时 / 中断 | 超时自动醒 / 中断 |
| 使用场景 | 线程间协作（生产者-消费者） | 简单延时 |
| 线程状态 | WAITING / TIMED_WAITING | TIMED_WAITING |
| 目的 | 让出锁，等条件满足 | 让出 CPU，不涉及锁 |

### 为什么 wait 定义在 Object 而不是 Thread？

- `wait` / `notify` 依赖 **monitor 锁**，而 Java 中每个对象都有一把锁
- 线程可以 `wait` 在任意对象上（`lock.wait()`），所以必须定义在所有对象的父类 `Object`
- `sleep` 是线程自身行为，不涉及锁，定义在 `Thread` 合理

### 标准用法

```java
// wait：必须先持有该对象的锁
synchronized (lock) {
    while (condition不满足) {     // 用 while 防止虚假唤醒
        lock.wait();              // 释放锁，进入等待
    }
    // 条件满足，干活
}

// 另一个线程
synchronized (lock) {
    condition = true;
    lock.notifyAll();             // 唤醒等待的线程
}

// sleep：任意位置
Thread.sleep(1000);               // 当前线程睡 1s，锁不释放
```

### 常见误区

| 误区 | 正解 |
|------|------|
| "sleep 也会释放锁" | ❌ sleep 不释放任何锁，抱着锁睡 |
| "wait 可以在任意地方调用" | ❌ 必须在 synchronized 内、且是同一把锁的对象上调用 |
| "wait 用 if 判断条件" | ⚠️ 应用 `while`，防止虚假唤醒和条件再次变化 |
| "notify 能精确唤醒某个线程" | ❌ notify 随机唤醒一个，无法指定；需要精确唤醒用 `Condition` |

### 与线程状态的关系

- `wait()` → WAITING；`wait(timeout)` → TIMED_WAITING
- `sleep(ms)` → TIMED_WAITING
- 详见 [线程的生命周期](#描述线程的生命周期)

### 总结

```
wait：Object 的方法，释放锁，需 synchronized，用于线程协作
sleep：Thread 的方法，不释放锁，随时可用，用于延时
一句话：wait 是"让出锁等通知"，sleep 是"抱着锁睡一会"
```

面试要点：是否释放锁（核心差异）、wait 为什么在 Object、wait 必须在 synchronized 内、while 防虚假唤醒。






## ThreadLocal 的原理？为什么会内存泄漏？

ThreadLocal 提供线程本地变量：每个线程一份副本，线程之间互不干扰。

### 数据结构

```
Thread
  └── threadLocals（ThreadLocalMap）
        └── Entry[]（数组，开放寻址解决冲突）
              └── Entry extends WeakReference<ThreadLocal<?>>
                    ├── key：ThreadLocal 对象（弱引用）
                    └── value：线程变量值（强引用）
```

- 每个线程内部有一个自己的 `ThreadLocalMap`，ThreadLocal 对象本身只是 key
- 数据存在**线程**上，而不是 ThreadLocal 里

```java
ThreadLocal<SimpleDateFormat> fmt = new ThreadLocal<>();
fmt.set(new SimpleDateFormat("yyyy-MM-dd"));  // 存到当前线程的 map
fmt.get();                                     // 从当前线程的 map 取
fmt.remove();                                  // 删掉这条 entry
```

### Hash 与冲突

- 每个 ThreadLocal 有个 `threadLocalHashCode`，递增分配（斐波那契散列 0x61c88647）
- 冲突用**开放寻址（线性探测）**，不是 HashMap 的链地址法
- 两个 ThreadLocal 在同一线程里各自占一个 Entry

### 为什么会内存泄漏？

链路：

```
ThreadLocal 外部强引用断开（方法结束/手动置 null）
      ↓
key 只剩弱引用 → GC 后 key = null
      ↓
Entry 变成 (null → value)
      ↓
value 仍是强引用，只要 Thread 活着就回收不掉
      ↓
线程池场景：Thread 长期存活 → value 滞留 → 内存泄漏
```

关键点：

- **泄漏的根源不是弱引用**，而是 **Thread 的生命周期太长**（线程池）
- 弱引用反而是**自救**：key 被回收后，后续 `get()/set()/remove()` 会顺手清理 key 为 null 的过期 Entry（探测式清理 + 启发式清理）
- 但如果之后**再没调用过任何方法**，value 就一直滞留

### 正确用法

```java
private static final ThreadLocal<SimpleDateFormat> FMT = new ThreadLocal<>();

try {
    FMT.set(new SimpleDateFormat("yyyy-MM-dd"));
    FMT.get().format(date);
} finally {
    FMT.remove();   // 用完必删，线程池场景必须
}
```

### ThreadLocal 的搭档

| 变体 | 说明 |
|------|------|
| `InheritableThreadLocal` | 子线程可继承父线程的值（创建子线程时复制） |
| `TransmittableThreadLocal`（阿里 TTL） | 解决线程池场景：值在线程间传递（池化线程复用后仍拿到提交者的上下文），配合 TtlRunnable/TtlCallable |
| `ScopedValue`（JDK 21） | 不可变、绑定作用域，虚拟线程时代替代 ThreadLocal |

### 总结

```
结构：Thread → ThreadLocalMap → Entry(key 弱引用, value 强引用)
泄漏条件：key 被 GC + 线程长期存活 + 之后不再 get/set/remove
自救：弱引用让 key=null，方法调用时顺手清理过期 Entry
习惯：线程池场景用完必须 remove()
```

面试要点：数据存在线程上而非 ThreadLocal、key 弱引用 value 强引用、泄漏根源是线程池长生命周期、remove() 习惯、TTL 解决池化传递。

## 描述线程的生命周期

Java 线程有 6 种状态，定义在 `Thread.State` 枚举中：

```
         ┌──────────────────────────────────────┐
         ▼                                      │
NEW → RUNNABLE ──→ BLOCKED ──→ RUNNABLE         │
         │    ──→ WAITING ──→ RUNNABLE          │
         │    ──→ TIMED_WAITING ──→ RUNNABLE     │
         └────────→ TERMINATED                   │
```

### 六种状态

| 状态 | 说明 | 触发条件 |
|------|------|----------|
| **NEW** | 已创建未启动 | `new Thread()` 后，未调 `start()` |
| **RUNNABLE** | 可运行（含就绪和运行中） | 调 `start()`；或被 OS 调度选中执行；或从阻塞/等待恢复 |
| **BLOCKED** | 等待 monitor 锁 | 进入 `synchronized` 块/方法但未获锁；锁释放后竞争成功回到 RUNNABLE |
| **WAITING** | 无限期等待 | `wait()` / `join()` / `LockSupport.park()`，需被其他线程显式唤醒 |
| **TIMED_WAITING** | 限时等待 | `sleep(ms)` / `wait(ms)` / `join(ms)` / `parkNanos(ns)`，超时或被唤醒后回 RUNNABLE |
| **TERMINATED** | 终止 | 线程 `run()` 执行完毕或异常退出 |

### 关键转换

#### NEW → RUNNABLE

- 调用 `start()`，一个线程只能 start 一次，重复调用抛 `IllegalThreadStateException`

#### RUNNABLE → BLOCKED

- 等待 `synchronized` 锁。**注意**：`ReentrantLock.lock()` 等待时状态是 WAITING，不是 BLOCKED

#### RUNNABLE → WAITING

- `Object.wait()`：释放锁，等待 `notify`/`notifyAll`
- `Thread.join()`：本质是在线程存活时 `wait()`
- `LockSupport.park()`：阻塞当前线程

#### RUNNABLE → TIMED_WAITING

- `Thread.sleep(ms)`：**不释放锁**，到时间自动唤醒
- `Object.wait(ms)`：释放锁，超时或被唤醒
- `Thread.join(ms)`

#### → TERMINATED

- `run()` 正常结束或抛出未捕获异常

### 易混点

| 对比 | BLOCKED | WAITING |
|------|---------|---------|
| 触发 | `synchronized` 锁竞争 | `wait()` / `park()` / `LockSupport` |
| 是否持有锁 | 未持有（等锁） | `wait()` 已释放锁；`park()` 不涉及锁 |
| `Lock` 实现 | 不会进 BLOCKED | `ReentrantLock` 等待时进 WAITING |

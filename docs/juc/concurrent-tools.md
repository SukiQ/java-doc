---
title: 并发工具
---

# 并发工具


## JUC 同步工具怎么选？

CountDownLatch、Semaphore 基于 AQS 共享模式实现；CyclicBarrier 基于 ReentrantLock + Condition；Phaser、Exchanger 是专有实现。语义各异，按场景选：

| 工具 | 语义 | 可重用 | 谁阻塞 | 典型场景 |
|------|------|--------|--------|----------|
| CountDownLatch | 倒计时门闩，减到 0 放行 | ❌ 一次性 | 等的人阻塞（主线程 await） | 主线程等 N 个子任务完成 |
| CyclicBarrier | 人齐开会，到指定数放行 | ✅ 自动重置 | 参与的人互相等 | N 个线程同步到某点再一起走 |
| Phaser | 分阶段屏障，逐 phase 推进 | ✅ 每阶段自动进入下一轮 | 参与者每阶段互相等 | 多阶段任务、参与方动态变化 |
| Semaphore | 许可证，可增可减 | ✅ 持续使用 | 抢不到许可的阻塞 | 限流，限制并发数 |
| Exchanger | 两线程汇合点交换数据 | ✅ 持续使用 | 先到的一方等另一方 | 生产者-消费者交换缓冲区 |

### 选型

```
等别人干完活        → CountDownLatch（一次性）
多人同步起跑        → CyclicBarrier（单阶段可循环）
多阶段推进/动态人数 → Phaser
限制并发数          → Semaphore（持续限流）
两个线程交换数据    → Exchanger
```

要点小结：语义差异（一次性 / 可循环 / 分阶段 / 许可制 / 两两交换）、谁在阻塞、可否重用、典型场景。



## CountDownLatch：倒计时门闩

计数只减不增，减到 0 放行所有 await 的线程。

```java
CountDownLatch latch = new CountDownLatch(3);

// 3 个子任务
for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        doWork();
        latch.countDown();          // 计数减 1
    }).start();
}

latch.await();                      // 主线程等计数归零
System.out.println("all done");
```

- 一次性：归零后不能重置；想复用要新建对象
- await 支持超时重载
- countDown() 不阻塞，可以由子任务自己减



## CyclicBarrier：可循环的屏障

N 个线程互相等，到齐后一起放行，屏障自动重置进入下一轮。

```java
CyclicBarrier barrier = new CyclicBarrier(3,
        () -> System.out.println("人到齐，开会"));  // 到齐后回调

for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        arriveAtMeetingRoom();
        barrier.await();            // 等其他人到齐
        startMeeting();             // 所有线程同时继续
    }).start();
}
// 循环场景：分段计算，每段算完汇合一次，自动进入下一轮
```

- `parties = N`：N 个线程到齐才放行
- 放行后**自动重置**，可循环使用（"Cyclic" 的含义）
- 一个线程中断/超时会抛 `BrokenBarrierException`，屏障失效



## Phaser：分阶段的屏障

CyclicBarrier 的强化版：把"到齐放行"组织成多个阶段（phase），且参与方可动态增减。

```java
Phaser phaser = new Phaser(3);          // 注册 3 个参与方

for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        doPhase1Work();
        phaser.arriveAndAwaitAdvance(); // 阶段 1：等大家都完成再继续
        doPhase2Work();
        phaser.arriveAndAwaitAdvance(); // 阶段 2：同样到齐才走
    }).start();
}
```

- 不必预先知道线程数：`register()` / `arriveAndDeregister()` 运行中增减参与方
- 三个到达方法：`arrive()`（到达不等待）、`arriveAndAwaitAdvance()`（到齐等下一阶段）、`arriveAndDeregister()`（干完退场）
- 重写 `onAdvance(phase, registeredParties)` 在每阶段切换时回调，返回 true 终止 Phaser
- 支持分层（构造时传 parent Phaser），降低高并发下的单点竞争
- 场景：迭代算法每轮同步、分阶段并行任务、参与线程数不确定的场景



## Semaphore：许可证限流

```java
Semaphore permits = new Semaphore(10);  // 10 个许可

void accessResource() throws InterruptedException {
    permits.acquire();      // 拿许可（拿不到阻塞）
    try {
        useLimitedResource();
    } finally {
        permits.release();  // 还许可
    }
}
```

- 限流：最多 10 个线程同时访问（如数据库连接池、接口限并发）
- release 可以不配对 acquire（可增发许可）；公平模式可选



## Exchanger：两线程交换数据

两个线程在汇合点交换各自持有的数据，`exchange()` 阻塞直到对方到达。

```java
Exchanger<Buffer> exchanger = new Exchanger<>();

new Thread(() -> {                       // 生产者
    Buffer buffer = new Buffer();
    while (true) {
        fillBuffer(buffer);              // 装数据
        buffer = exchanger.exchange(buffer);  // 满缓冲区换对方的空缓冲区
    }
}).start();

new Thread(() -> {                       // 消费者
    Buffer buffer = new Buffer();
    while (true) {
        consume(buffer);                 // 清空
        buffer = exchanger.exchange(buffer);  // 空的换回满的
    }
}).start();
```

- 只支持两方成对交换；多个线程同时 exchange 时会两两配对
- 支持超时：`exchange(data, timeout, unit)`
- 场景：生产者-消费者交换缓冲区、两个线程交换中间结果



## CompletableFuture 怎么用？

`CompletableFuture` 是 JDK 8 的异步编排工具，解决 `Future.get()` 阻塞、无法链式组合、无法回调的问题。

### 与 Future 的区别

| 对比项 | Future | CompletableFuture |
|--------|--------|---------------------|
| 获取结果 | `get()` 阻塞轮询 | 回调（thenApply 等完成时自动执行） |
| 链式组合 | ❌ | ✅ thenApply / thenCompose |
| 组合多个 | ❌ | ✅ allOf / anyOf |
| 异常处理 | ❌ | ✅ exceptionally / handle |
| 主动完成 | ❌ | ✅ complete(value) |
| 指定线程池 | ❌ 默认当前线程 | ✅ 默认 ForkJoinPool.commonPool，可传入自定义 |

### 常用 API

| 类别 | 方法 | 说明 |
|------|------|------|
| 创建 | `supplyAsync(Supplier)` | 有返回值的异步任务 |
| | `runAsync(Runnable)` | 无返回值 |
| 转换 | `thenApply(fn)` | 拿结果转换（T → R） |
| 消费 | `thenAccept(consumer)` | 拿结果消费，无返回 |
| 组合 | `thenCompose(fn)` | 依赖前一步再发一个异步请求（扁平化） |
| 合并 | `thenCombine(cf, fn)` | 两个独立任务的结果合并 |
| 汇合 | `allOf(cf...)` | 等全部完成 |
| | `anyOf(cf...)` | 任一完成即完成 |
| 异常 | `exceptionally(fn)` | 捕获异常给默认值 |
| | `handle(fn, ex)` | 结果和异常都处理 |
| | `whenComplete` | 完成时回调（不改变结果） |

### 异步编排示例（并行调三个接口汇总）

```java
ExecutorService pool = Executors.newFixedThreadPool(3);

CompletableFuture<User> userF =
    CompletableFuture.supplyAsync(() -> queryUser(id), pool);

CompletableFuture<List<Order>> orderF =
    CompletableFuture.supplyAsync(() -> queryOrders(id), pool);

CompletableFuture<Integer> pointF =
    CompletableFuture.supplyAsync(() -> queryPoints(id), pool);

CompletableFuture.allOf(userF, orderF, pointF)          // 等全部完成
    .thenApply(v -> new UserVO(userF.join(), orderF.join(), pointF.join()))  // 汇总
    .exceptionally(ex -> {
        log.error("query failed", ex);
        return UserVO.empty();
    })
    .thenAccept(vo -> render(vo));
```

三个接口并行执行，总耗时 ≈ 最慢的那个，而非三者相加。

### 两个坑

- **默认线程池**：不传 executor 时用 `ForkJoinPool.commonPool()`（守护线程，CPU 核数-1），IO 阻塞任务会饿死其他使用者 → **生产必传自定义线程池**
- **join vs get**：join 抛非受检异常，get 抛受检异常（InterruptedException/ExecutionException）

### 总结

```
CompletableFuture = Future + 回调 + 链式 + 组合 + 异常处理
核心 API：supplyAsync → thenApply/thenCompose → allOf → exceptionally
注意：生产环境显式传线程池
```

要点小结：与 Future 的差异（回调/链式/组合）、thenApply vs thenCompose、allOf 并行编排示例、默认 commonPool 的坑。

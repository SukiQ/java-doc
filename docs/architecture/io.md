---
title: IO
---

# IO


## AIO、BIO 和 NIO 的区别是什么？

| 对比 | BIO（Blocking IO） | NIO（Non-blocking/New IO） | AIO（Asynchronous IO） |
|------|--------------------|----------------------------|------------------------|
| 模型 | **同步阻塞** | **同步非阻塞**（IO 多路复用） | **异步非阻塞** |
| JDK | 1.0 | 1.4（java.nio） | 1.7（AIO/NIO.2） |
| 线程行为 | 读写期间线程**阻塞等待** | 发起读后可做别的，**轮询就绪**；就绪后读写仍同步 | 发起读写后**立即返回**，完成后**回调通知** |
| 数据处理 | 面向**流**（字节流/字符流） | 面向 **Buffer/块** | Buffer + 回调 |
| 核心组件 | Socket / ServerSocket | **Channel + Selector + Buffer** | AsynchronousSocketChannel + Future/CompletionHandler |
| 并发能力 | 一连接一线程 | 一个 Selector 管理上千 Channel | 内核完成后回调，线程几乎不闲等 |
| 复杂度 | 简单 | 高（Reactor 模式） | 更高（Proactor 模式） |
| 适用 | 连接少且固定 | 高并发、连接多数据短（Netty） | 连接多且传输时间长（大文件） |

### 关键区别：谁等数据

```
BIO：内核准备数据 → 我等着（阻塞） → 拷贝完成 → 继续
NIO：我先问（select）→ 就绪了通知我 → 我自己去拷贝（拷贝期间阻塞）
AIO：我发起 → 内核准备+拷贝全做完 → 回调我（全程不参与）
```

- **BIO**：从发起到拷贝完成，线程一直等
- **NIO**：省掉"等内核准备数据"，但**内核拷贝到用户空间**这步线程还是要做
- **AIO**：连拷贝都不用等，整个阶段完成才通知

### Reactor 与 Proactor

| 模式 | 对应 | 流程 |
|------|------|------|
| **Reactor**（反应器） | NIO / Netty | 注册事件 → Selector 通知**就绪** → 应用自己 read/write |
| **Proactor**（前摄器） | AIO | 发起异步读写 → 内核完成 → **回调**通知结果 |

**注**：现实选择：Linux 的 AIO 实现不完善（epoll 本质是就绪通知），落地生态是 **NIO（Netty）**——Netty 用 epoll/kqueue 模拟异步；AIO 几乎没被采用（Netty 曾删除 AIO transport）。

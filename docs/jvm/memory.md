# JVM 内存结构


## JVM 虚拟机有哪些东西？

<img src="/pictures/1.png" alt="1" style="zoom: 50%;" />

### 堆

<img src="/pictures/3.png" alt="3" style="zoom:50%;" />

- **线程共享**
- 存放几乎所有对象实例和数组，是 GC 的主要管理区域
- 逻辑上分为年轻代和老年代
- 物理上可不连续，通过 `-Xms` 和 `-Xmx` 控制最小/最大值

**注**：一般会把 `-Xms` 和 `-Xmx` 设置为一样的，这样JVM就不需要在GC后去修改堆内存的大小。默认最大内存是服务器内存的1/4




### 方法区

- **线程共享**
- 存储类信息、常量、静态变量、JIT 编译后的代码等
- JDK 7 及以前由永久代（PermGen）实现，JDK 8 起改为元空间（Metaspace），使用本地内存
- 运行时**常量池**是方法区的一部分

**注**：元空间取代永久代的原因：永久代在堆内、大小受 `-XX:MaxPermSize` 限制，元空间使用**本地内存**，默认只受物理内存限制）





### 虚拟机栈

<img src="/pictures/2.png" alt="2" style="zoom:50%;" />

- **线程私有**，生命周期与线程相同
- 每个方法执行时创建一个**栈帧**，包含：局部变量表、操作数栈、动态链接、方法出口
- 方法执行结束，对应栈帧出栈销毁
- 可通过 `-Xss` 设置栈大小
- 线程太多，可能会出现 `OutofMemoryError`，方法调用层级太多，可能会出现 `StackOverflowError`



### 本地方法栈

- **线程私有**
- 为 Native 方法（非 Java 实现的方法）服务，作用与虚拟机栈类似



### 程序计数器

- **线程私有**
- 记录当前线程执行的字节码行号，分支、循环、跳转、异常处理都依赖它
- 执行 Native 方法时，计数器值为空（undefined）



### 类加载子系统

负责将 `.class` 文件加载到内存，过程包括：

1. **加载**：通过全限定名获取二进制字节流
2. **链接**：验证 → 准备 → 解析
3. **初始化**：执行类构造器 `<clinit>()`

类加载器层次（双亲委派模型）：

<img src="/pictures/5.png" alt="5" style="zoom:50%;" />

- **启动类加载器（Bootstrap ClassLoader）**：C++ 实现，加载 `<JAVA_HOME>/lib` 下核心类（如 `java.lang.*`、`java.util.*`），是 JVM 的一部分，Java 中无法直接获取其引用
- **扩展类加载器（Extension ClassLoader）**：Java 实现，加载 `<JAVA_HOME>/lib/ext` 目录或 `java.ext.dirs` 指定路径下的类
- **应用程序类加载器（Application ClassLoader）**：加载用户类路径（`-classpath` / `-cp`）下的类，是默认的类加载器，`ClassLoader.getSystemClassLoader()` 返回的就是它
- **自定义类加载器**：继承 `ClassLoader`，重写 `findClass()`，实现自定义加载逻辑（如从网络、加密文件、**热部署**等场景加载类）

**双亲委派机制**：收到加载请求时，先委派父加载器加载，父加载器无法完成时才自己加载。好处是防止核心类被篡改（如自定义 `java.lang.String` 会被 Bootstrap 加载的覆盖），也避免重复加载。

**要点**：JDK 9+ Extension ClassLoader 改为平台类加载器 Platform ClassLoader，加载 Java 平台模块，用于实现模块化




### 执行引擎

<img src="/pictures/4.png" alt="4" style="zoom:50%;" />

- **解释器**：逐条解释字节码执行
- **JIT 编译器**：将热点代码编译为本地机器码，提升性能
- **垃圾收集器（GC）**：负责堆内存的自动回收

常见 GC 收集器：

| 收集器 | 适用区域 | 算法 |
|--------|----------|------|
| Serial | 新生代 | 复制 |
| ParNew | 新生代 | 复制 |
| Parallel Scavenge | 新生代 | 复制 |
| CMS | 老年代 | 标记-清除 |
| G1 | 全堆 | 标记-整理 + 分区 |
| ZGC | 全堆 | 染色指针 + 读屏障 |

### 本地方法接口

Java 调用 C/C++ 本地方法的接口，连接 JVM 与底层操作系统。



## 对象一定分配在堆中吗？

**不一定。** 经过逃逸分析，未逃逸的对象可以分配在栈上（栈上分配）或直接在寄存器/标量替换中消化，不一定进堆。

### 逃逸分析

JIT 编译时分析对象的动态作用域，判断是否"逃逸"出方法或线程：

| 状态 | 说明 | 分配方式 |
|------|------|----------|
| **未逃逸（NoEscape）** | 对象仅在方法内部使用，不外传 | 可栈上分配 / 标量替换 |
| **方法逃逸（MethodEscape）** | 对象被作为参数传出、返回、赋给外部字段 | 必须在堆分配 |
| **线程逃逸（ThreadEscape）** | 对象被其他线程访问（如赋给静态变量） | 必须在堆分配 |

### 栈上分配

- 未逃逸、可拆分的小对象，直接分配在线程的虚拟机栈上
- 方法结束栈帧销毁，对象随之回收，**无需 GC 介入**
- 好处：减轻堆压力，减少 GC 频率

### 标量替换

- **标量**：无法再分解的数据（基本类型、引用）
- 若对象未逃逸且可拆分，JIT 不真正创建对象，而是把它的成员变量打散成若干标量，直接分配在栈帧的局部变量表中
- 例如 `Point p = new Point(1, 2); return p.x + p.y;` 会被优化为直接操作两个 int，对象根本不存在

### 相关参数

```bash
-XX:+DoEscapeAnalysis    # 开启逃逸分析（JDK 8 默认开启）
-XX:-DoEscapeAnalysis    # 关闭逃逸分析（对象就一定进堆）
-XX:+EliminateAllocations # 开启标量替换（默认开启）
-XX:+PrintEscapeAnalysis  # 输出逃逸分析结果（debug 用）
```



## JVM 对象分配如何保证线程安全？

堆是线程共享的，多线程同时分配对象会竞争同一块内存。JVM 通过 **TLAB** 机制解决，核心思路是"空间换竞争"。

### TLAB（Thread Local Allocation Buffer）

- JVM 在 Eden 区为**每个线程预分配一小块私有内存**，称为 TLAB
- 线程分配对象时优先在自己的 TLAB 上分配，**无需同步、无竞争**
- TLAB 占 Eden 的大约 1%（可通过 `-XX:TLABWasteTargetPercent` 调整）

### 对象分配流程

<img src="/pictures/6.png" alt="6" style="zoom:50%;" />

### 无 TLAB 时：CAS + 失败重试

- 对堆的空闲指针做 **CAS（Compare-And-Swap）** 原子更新，抢占分配空间
- 多个线程同时分配时，失败者自旋重试
- 性能远低于 TLAB，所以 TLAB 是 JVM 默认开启的优化手段

### 相关参数

```bash
-XX:+UseTLAB              # 开启 TLAB（默认开启）
-XX:-UseTLAB              # 关闭 TLAB（退化为 CAS 分配）
-XX:TLABSize=             # 设置每个 TLAB 大小
-XX:TLABWasteTargetPercent=1  # TLAB 占 Eden 的百分比
```



## 对象的创建过程是怎样的？内存布局呢？

### 创建过程（五步）

```
new 指令
  ↓
1. 类加载检查：类是否已加载、解析、初始化，没有则先执行类加载
  ↓
2. 分配内存：TLAB →（用完）→ Eden CAS；大对象直接进老年代
  ↓
3. 初始化零值：成员变量赋默认值（int=0、引用=null）
  ↓
4. 设置对象头：Mark Word（hashCode、GC 年龄、锁标志）+ 类型指针
  ↓
5. 执行 <init>：构造函数，赋真实初始值
```

- 分配方式：**指针碰撞**（内存规整，Serial/ParNew/G1）或**空闲列表**（内存碎片，CMS）
- 线程安全靠 TLAB 或 CAS（见上一题）

### 内存布局（三部分）

```
+---------------------------+
| 对象头 (Header)           |
|   Mark Word（8字节）       |  ← hashCode、GC年龄、锁标志位
|   类型指针（压缩后4字节）    |  ← 指向类元数据
|   （数组额外有 length）     |
+---------------------------+
| 实例数据 (Instance Data)   |  ← 各类型字段（含父类）
+---------------------------+
| 对齐填充 (Padding)         |  ← 补齐到 8 字节整数倍
+---------------------------+
```

| 部分 | 内容 |
|------|------|
| 对象头 | Mark Word + 类型指针（数组多一个 length） |
| 实例数据 | 字段值，相同宽度的字段分配在一起，父类字段在子类前面 |
| 对齐填充 | HotSpot 要求对象起始地址 8 字节对齐，没有就补齐 |

### 对象访问定位

栈中的引用变量如何定位堆中的对象，两种方式：

| 方式 | 原理 | 优缺点 |
|------|------|--------|
| **句柄访问** | 堆中划出句柄池，引用存句柄地址，句柄存对象地址和类型地址 | GC 移动对象只改句柄，引用不变；多一次寻址开销 |
| **直接指针** | 引用直接存对象地址，对象头里存类型指针 | 访问快（少一次寻址）；GC 移动对象需改所有引用 |

HotSpot 使用**直接指针**。

### 总结

```
创建：类检查 → 分配 → 零值 → 对象头 → <init>
布局：对象头（Mark Word + 类型指针）+ 实例数据 + 对齐填充
访问：HotSpot 用直接指针（快），句柄池利于对象移动
```

面试要点：五步流程、Mark Word 存什么、8 字节对齐、直接指针 vs 句柄的取舍。



## JVM 常见的参数配置有哪些？

JVM 参数分三类：`-X`（标准扩展）、`-XX`（非稳定，JVM 实现相关）、系统属性。按用途整理如下：

### 内存相关

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-Xms` | 堆初始大小 | 物理内存 1/64 |
| `-Xmx` | 堆最大大小 | 物理内存 1/4 |
| `-Xmn` | 新生代大小 | 堆的 1/3 ~ 1/2 |
| `-XX:NewRatio=2` | 老年代与新生代比例 | 2 |
| `-XX:SurvivorRatio=8` | Eden 与单个 Survivor 比例 | 8 |
| `-Xss` | 单线程栈大小 | 1MB（64 位） |
| `-XX:MetaspaceSize=` | 元空间初始触发 GC 阈值 | 约 21MB |
| `-XX:MaxMetaspaceSize=` | 元空间最大值（无上限时可能泄漏） | 无限 |
| `-XX:MaxDirectMemorySize=` | 直接内存最大值 | 等于 -Xmx |

### GC 收集器选择

| 参数 | 说明 |
|------|------|
| `-XX:+UseSerialGC` | Serial + Serial Old |
| `-XX:+UseParNewGC` | ParNew + Serial Old（JDK 9 废弃） |
| `-XX:+UseParallelGC` | Parallel Scavenge + Parallel Old（JDK 8 默认） |
| `-XX:+UseConcMarkSweepGC` | ParNew + CMS（JDK 9 废弃） |
| `-XX:+UseG1GC` | G1（JDK 9+ 默认） |
| `-XX:+UseZGC` | ZGC（JDK 11+） |
| `-XX:+UseShenandoahGC` | Shenandoah（JDK 12+） |

### GC 细节调优

| 参数 | 说明 |
|------|------|
| `-XX:MaxTenuringThreshold=15` | 对象晋升老年代年龄阈值（4~15） |
| `-XX:PretenureSizeThreshold=` | 大对象直接进老年代的阈值（Serial/ParNew 有效） |
| `-XX:MaxGCPauseMillis=200` | 目标最大停顿时间（G1 / Parallel） |
| `-XX:GCTimeRatio=99` | 目标吞吐量（1/(1+ratio)） |
| `-XX:+UseAdaptiveSizePolicy` | 自适应调整新生代比例（Parallel 默认开启） |
| `-XX:+HandlePromotionFailure` | 空间分配担保（JDK 8 后默认允许） |

### GC 日志

| 参数 | 说明 |
|------|------|
| `-XX:+PrintGCDetails` | 输出 GC 详情（JDK 8） |
| `-XX:+PrintGCDateStamps` | 输出时间戳（JDK 8） |
| `-Xloggc:<file>` | GC 日志输出路径（JDK 8） |
| `-Xlog:gc*:file=gc.log` | 统一日志（JDK 9+） |
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时自动导出堆快照 |
| `-XX:HeapDumpPath=<path>` | 堆快照保存路径 |

### OOM 与故障排查

| 参数 | 说明 |
|------|------|
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时自动 dump 堆 |
| `-XX:ErrorFile=<path>` | 致命错误日志（hs_err）路径 |
| `-XX:OnOutOfMemoryError="<cmd>"` | OOM 时执行指定命令（如发告警、重启脚本） |


## 常见的 OOM 类型有哪些？如何排查？

### 各区域 OOM 类型

| 报错信息 | 出错区域 | 常见原因 |
|----------|----------|----------|
| `Java heap space` | 堆 | 对象过多/内存泄漏/堆设置过小；大查询、大文件加载 |
| `GC overhead limit exceeded` | 堆 | GC 占用超 98% 时间却回收不到 2% 空间（OOM 前兆） |
| `Metaspace` / `PermGen space` | 方法区 | 动态生成类过多（CGLib 代理、反射）、未设置上限 |
| `unable to create new native thread` | 虚拟机栈 | 线程数超过系统限制（ulimit）或内存不够创建栈 |
| `StackOverflowError` | 虚拟机栈 | 递归过深、方法调用层级过多（注意：是 SOE 不是 OOM） |
| `Direct buffer memory` | 直接内存 | NIO DirectByteBuffer 未释放、未设 `-XX:MaxDirectMemorySize` |
| `Requested array size exceeds VM limit` | 堆 | 申请的数组超过虚拟机限制 |

### 排查步骤

```
1. 拿到报错信息，确认 OOM 类型（哪个区域）
      ↓
2. 确认有 dump：-XX:+HeapDumpOnOutOfMemoryError
   没有则现场 jmap -dump 补一份（会 STW，慎用）
      ↓
3. MAT / Visual VM / JProfiler 分析 dump
   看 Dominator Tree，找占用最大的对象
      ↓
4. 沿 GC Roots 引用链定位是谁持有了大对象
      ↓
5. 结合代码定位原因：泄漏（集合只加不删）/ 溢出（一次性加载太多）/ 配置（堆太小）
```

### 典型案例

```java
// 堆 OOM：静态集合只增不减（最常见泄漏源）
static List<Object> cache = new ArrayList<>();
void handle(Request req) {
    cache.add(req.payload);   // 无淘汰机制，最终 OOM
}

// 元空间 OOM：动态代理不停生成类
while (true) {
    Enhancer.create(Foo.class, interceptor);   // 每次都是新的代理类
}
```

### 内存泄漏常见来源

| 来源 | 说明 |
|------|------|
| 静态集合 | 生命周期与类相同，内部对象永不释放 |
| ThreadLocal | 线程池场景未 remove，Entry 滞留（详见 ThreadLocal 题） |
| 资源未关闭 | 连接、流、Channel 未在 finally 关闭 |
| 监听器/回调 | 注册后未注销 |
| 不当缓存 | 无界缓存、无过期策略 |

### 总结

```
先看类型：heap / metaspace / stack / direct memory
再拿 dump：HeapDumpOnOutOfMemoryError 提前配置
分析工具：MAT 看 Dominator Tree + 引用链
定位代码：泄漏（只加不删）或溢出（一次太多）
```

面试要点：各区域 OOM 的典型报错与成因、`-XX:+HeapDumpOnOutOfMemoryError` 提前配置、MAT 分析思路、静态集合与 ThreadLocal 两大泄漏源。




## 线上 OOM 如何定位和解决？

### 第一步：应急止血，保留现场

| 动作 | 说明 |
|------|------|
| 保留 dump | 事前配置 `-XX:+HeapDumpOnOutOfMemoryError`；没配则现场 `jmap -dump`（会 STW，先摘流量） |
| 摘流量重启 | 恢复服务优先，dump 留到其他实例分析 |
| 保留日志 | GC 日志、应用日志、hs_err 文件一并带走 |

### 第二步：分析 dump 定位

| 工具/手段 | 用途 |
|-----------|------|
| **MAT** | 看 **Dominator Tree** 找占内存最大的对象 → 沿 **GC Roots 引用链** 看谁持有它 → 定位代码 |
| MAT Leak Suspects | 自动出泄漏嫌疑报告 |
| Visual VM / JProfiler | 可视化分析，适合不太大的 dump |
| `jmap -histo:live` | 无 dump 时的轻量手段：类直方图看哪类对象暴增 |

### 第三步：判断泄漏还是溢出

| 类型 | 特征（jstat/监控表现） | 解决 |
|------|------------------------|------|
| **内存泄漏** | 老年代**持续增长**，Full GC 后回收不掉，缓慢爬升直到 OOM | 修代码：见下表泄漏源 |
| **内存溢出** | 突发顶上去直接 OOM（一次加载太多） | 改造：分页/流式处理/限制单次数据量（如导出走分批、查询加 limit） |
| **配置不足** | 稳态下堆使用率长期偏高、GC 频繁但无泄漏 | 调大 `-Xmx`（同步评估容器/机器内存） |

### 内存泄漏常见来源

| 来源 | 排查线索 |
|------|----------|
| 静态集合只加不删 | MAT 里引用链指向类静态字段 |
| ThreadLocal 未 remove | 线程池场景 Entry 滞留（见 ThreadLocal 题） |
| 无界缓存/无过期策略 | 本地 Map 当缓存、无限增长的 BlockingQueue |
| 资源未关闭 | 连接、流、Channel、ResultSet |
| 监听器/回调未注销 | 注册了不释放 |

### 元空间/其他类型

| OOM 类型 | 定位与解决 |
|----------|-----------|
| Metaspace | dump 或 arthas 看类加载数；动态代理/CGLib 类未复用 → 缓存 Enhancer、设置 `MaxMetaspaceSize` |
| unable to create new thread | `jstack`/线程数统计 → 线程池无界创建 → 统一线程池；或调系统 ulimit |
| Direct buffer memory | NIO 堆外内存未释放 → 检查 Netty/DirectByteBuffer 使用，配置 `-XX:MaxDirectMemorySize` |

**注**：预防优于排查：接入监控告警（老年代使用率 >80% 报警、GC 频次异常报警）、压测验证容量、核心服务常开 HeapDumpOnOutOfMemoryError。

# 垃圾回收


## GC 是如何工作的？

判断对象是否存活 → 选择 GC 算法 → 执行回收

**提示**：GC调优的目的是减少STW（停顿任务）的时间（full GC和minor GC都会触发）




### 判断对象存活

- 引用计数法：对象被引用时计数 +1，引用失效时 -1，计数为 0 即可回收，无法解决循环引用问题，**主流 JVM 不采用**

- 可达性分析：从 **GC Roots** 出发，沿引用链向下搜索，不可达的对象即为可回收对象。GC Roots 包括：1.虚拟机栈中局部变量引用的对象。2.方法区中静态变量引用的对象。3.方法区中常量引用的对象。4.本地方法栈中引用的对

### 四种引用类型

| 引用类型 | 类 | 回收时机 | 典型用途 |
|----------|-----|----------|----------|
| **强引用（Strong）** | 无（直接 `=`） | 永不回收，宁可 OOM | 普通对象 |
| **软引用（Soft）** | `SoftReference` | 内存不足时回收 | 内存敏感缓存（图片缓存） |
| **弱引用（Weak）** | `WeakReference` | 下次 GC 必回收 | ThreadLocal 的 key、WeakHashMap |
| **虚引用（Phantom）** | `PhantomReference` | 随时回收，不影响对象生命周期 | 堆外内存回收通知（DirectByteBuffer） |

```java
Object obj = new Object();                    // 强引用
SoftReference<Object> soft = new SoftReference<>(obj);   // 软引用
WeakReference<Object> weak = new WeakReference<>(obj);   // 弱引用
PhantomReference<Object> phantom = new PhantomReference<>(obj, queue);  // 虚引用，必须配引用队列

obj = null;  // 去掉强引用后，soft/weak 指向的对象按各自规则回收
```

要点：

- 引用强度递减：强 > 软 > 弱 > 虚
- **软引用**：适合缓存，内存紧张时 JVM 自动释放，避免 OOM
- **弱引用**：ThreadLocalMap 的 Entry 的 key 是弱引用（详见 ThreadLocal 题），GC 后 key 变 null
- **虚引用**：唯一目的是对象被回收时收到 `ReferenceQueue` 通知，配合 `Cleaner` 清理堆外内存




### 垃圾回收算法

- 标记-清除算法：标记所有需要回收的对象，统一清除。但容易产生内存碎片，分配大对象时可能提前触发 Full GC

- 复制算法：将内存分为两块，每次只用一块，GC 时将存活对象复制到另一块，清空当前块，无碎片，分配快。但可用内存减半，适合单次清理垃圾较多的场景
- 标记-整理算法：标记存活对象后，向一端移动整理，清除边界以外的空间，无碎片。但移动对象成本高，需要更新引用



### 分代收集

- **新生代**：对象朝生夕灭，采用复制算法
  
- **老年代**：对象存活率高，采用标记-清除算法或标记-整理算法

  

### GC 类型

| 类型 | 回收区域 | 触发条件 | STW |
|------|----------|----------|-------------|
| **Minor GC（Young GC）** | 新生代（Eden + Survivor） | Eden 区空间不足 | 短，新生代存活率低，复制快 |
| **Major GC** | 老年代 | 老年代空间不足 | 较长，通常与 Minor GC 配合 |
| **Full GC** | 整个堆 + 方法区（元空间） | 老年代满、元空间不足、`System.gc()`、空间分配担保失败、CMS 并发失败 | 最长，应尽量避免 |

几点说明：

- **Major GC 和 Full GC 常被混用**：严格说 Major GC 只回收老年代，Full GC 回收整个堆，但多数收集器中老年代回收会带上整个堆，所以二者实际场景下基本等同
- **Full GC 是性能杀手**：STW 时间最长，调优的核心目标之一就是减少 Full GC 频次
- ** Minor GC 不一定清理老年代，但可能触发晋升**：Survivor 放不下的对象会进入老年代，间接影响 Full GC 频率



### GC 过程

1. **停顿（STW）**：GC 时暂停应用线程（部分收集器可并发）
2. **初始标记**：标记 GC Roots 直接引用的对象（STW，耗时短）
3. **并发标记**：从初始标记对象出发，遍历整个引用链（与应用并发执行）
4. **重新标记**：修正并发标记期间引用变化的对象（STW，耗时短）
5. **并发清除 / 整理**：回收垃圾对象（与应用并发执行）

::: warning
以上为 CMS / G1 等收集器的典型流程，Serial / Parallel 等收集器流程更简单
:::

### 三色标记与漏标

并发标记（CMS / G1）中用三种颜色描述对象状态：

| 颜色 | 含义 |
|------|------|
| **白色** | 尚未被扫描（最终仍为白色 = 垃圾） |
| **灰色** | 自身已扫描，但成员引用还没扫完 |
| **黑色** | 自身和所有成员引用都已扫描（确认存活） |

**漏标问题**：并发标记时用户线程还在改引用，可能把"存活对象"错标成白色被回收，后果严重。

漏标必须同时满足两个条件：

```
1. 灰色对象 断开了 到白色对象的引用（或新建引用关系变动）
2. 黑色对象 新增了 到白色对象的引用
```

两种解决方案（破坏其中一个条件）：

| 方案 | 破坏条件 | 做法 | 使用者 |
|------|----------|------|--------|
| **增量更新（Incremental Update）** | 条件 2 | 黑色对象新增指向白色的引用时，记录下来，重新标记阶段把该黑色变灰重扫 | CMS |
| **原始快照（SATB，Snapshot At The Beginning）** | 条件 1 | 灰色对象删除指向白色的引用时，记录旧引用，按"开始标记那一刻的对象图快照"处理 | G1 |

两者都通过**写屏障**拦截引用变动并记录，代价是产生浮动垃圾（SATB 尤其明显）。





### 安全点与安全区域

- **安全点（Safepoint）**：程序执行到特定位置时才能 GC，JIT 会在方法调用、循环回边等处设置安全点
- **安全区域（Safe Region）**：线程处于阻塞或睡眠状态时无法主动到达安全点，用安全区域解决（如 sleep、blocked）



### 常见 GC 收集器

| 收集器 | 代 | 并发/并行 | 算法 | 特点 |
|--------|-----|-----------|------|------|
| Serial / Serial Old | 新生代 / 老年代 | 单线程 | 复制 / 标记-整理 | 单核、Client 模式，STW 时全线程暂停 |
| ParNew | 新生代 | 并行 | 复制 | Serial 的多线程版，常与 CMS 配合 |
| Parallel Scavenge / Parallel Old | 新生代 / 老年代 | 并行 | 复制 / 标记-整理 | JDK 8 默认，注重吞吐量 |
| CMS | 老年代 | 并发 | 标记-清除 | 追求低STW，但有内存碎片、并发失败风险，JDK 9 起废弃 |
| G1 | 全堆 | 并发 + 并行 | 标记-整理 + 分区 | JDK 9+ 默认，可控STW时间，适合大堆 |
| ZGC | 全堆 | 并发 | 染色指针 + 读屏障 | STW<10ms，TB 级堆，JDK 15 转正 |
| Shenandoah | 全堆 | 并发 | 转移指针（Brooks） + 读屏障 | RedHat 出品，停顿与堆大小无关 |

各收集器特点和适用场景：

- **Serial / Serial Old**
  - 特点：单线程收集，GC 时暂停所有工作线程；简单高效，无线程交互开销
  - 场景：单核 CPU、小内存（几十到一两百 MB）、Client 模式应用、桌面程序
- **ParNew**
  - 特点：Serial 的多线程版本，其余行为完全一致
  - 场景：配合 CMS 使用（JDK 8 时代低停顿组合的新生代选择）
- **Parallel Scavenge / Parallel Old**
  - 特点：目标是**吞吐量**（用户代码运行时间占比），可通过 `-XX:MaxGCPauseMillis` 和 `-XX:GCTimeRatio` 精确控制
  - 场景：后台运算型任务，对停顿不敏感、对吞吐量敏感（如批处理、数据分析）
- **CMS（Concurrent Mark Sweep）**
  - 特点：以获取最短停顿为目标，大部分标记和清除与用户线程并发执行；缺点是 CPU 敏感、产生浮动垃圾和内存碎片，并发失败会退化为 Serial Old
  - 场景：重视响应速度的互联网网站 / B/S 服务（JDK 8 时代的常见选择，现已废弃）
- **G1（Garbage First）**
  - 特点：将堆划分为多个大小相等的 Region，优先回收垃圾最多的分区；可预测停顿时间模型（`-XX:MaxGCPauseMillis`）；兼顾吞吐和停顿
  - 场景：大堆（6GB+）、多核服务端应用，替代 CMS 的主流选择（JDK 9+ 默认）
- **ZGC**
  - 特点：染色指针 + 读屏障实现并发整理，停顿时间不超过 10ms 且与堆大小无关；吞吐量略有损耗（约 10%）
  - 场景：超大堆（TB 级）、对停顿极度敏感的服务（如金融交易、实时服务），JDK 15+ 可生产使用
- **Shenandoah**
  - 特点：与 ZGC 目标类似的低停顿收集器，RedHat 主导，OpenJDK 内置（Oracle JDK 不含）
  - 场景：与 ZGC 类似，使用 OpenJDK 发行版的低延迟场景

选择建议：

| 需求 | 推荐 |
|------|------|
| 吞吐量优先、批处理 | Parallel Scavenge + Parallel Old |
| 大堆 + 均衡（JDK 8+） | G1 |
| 超大堆 + 极低停顿（JDK 15+） | ZGC / Shenandoah |
| 小内存、单核、客户端 | Serial |



## 如何调优GC？

#### jps

- 列出正在运行的 Java 进程及其主类、PID

```bash
jps -l    # 显示主类全限定名
jps -v    # 显示 JVM 参数
```

#### jstat

- 监控 GC 和类加载统计信息，是 GC 调优最常用的命令

```bash
# 每 1s 输出一次 GC 概况，共 10 次
jstat -gcutil <pid> 1000 10

# 输出各代内存使用情况
jstat -gc <pid>
```

常用字段：

| 字段 | 说明 |
|------|------|
| S0 / S1 | Survivor 0 / 1 使用率 |
| E | Eden 使用率 |
| O | 老年代使用率 |
| M | 元空间使用率 |
| YGC / YGCT | Young GC 次数 / 总耗时 |
| FGC / FGCT | Full GC 次数 / 总耗时 |
| GCT | GC 总耗时 |

#### jmap

- 生成堆 dump 文件，查看堆内存概况

```bash
jmap -heap <pid>              # 堆内存配置和使用情况
jmap -histo:live <pid>        # 存活对象统计（按大小排序）
jmap -dump:format=b,file=heap.hprof <pid>  # 导出堆快照
```

#### jstack

- 查看线程堆栈，排查死锁、线程阻塞等问题

```bash
jstack <pid>                  # 打印线程堆栈
jstack -l <pid>               # 打印锁信息
```

#### jcmd

- JDK 8+ 推荐的多功能诊断工具，替代部分 jmap / jstack 功能

```bash
jcmd <pid> VM.flags           # 查看 JVM 参数
jcmd <pid> GC.heap_info       # 堆信息
jcmd <pid> Thread.print       # 线程堆栈
jcmd <pid> GC.class_histogram # 类直方图
```

### 常用可视化工具

| 工具 | 说明 |
|------|------|
| **Visual VM** | JDK 自带（JDK 9+ 需单独下载），集成 CPU/内存/线程/GC 监控，支持插件 |
| **JConsole** | JDK 自带，基于 JMX，监控内存、线程、类加载、MBean |
| **JITWatch** | 分析 JIT 编译日志，查看热点代码编译情况 |
| **MAT（Memory Analyzer Tool）** | Eclipse 出品，分析 heap dump，定位内存泄漏 |
| **GCEasy** | 在线工具，上传 GC 日志自动分析停顿时间、吞吐量等 |
| **Arthas** | 阿里开源的在线诊断工具，无需重启应用，支持反编译、监控方法执行等 |

### GC 日志相关参数

```bash
# JDK 8
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:gc.log

# JDK 9+（统一日志格式）
-Xlog:gc*:file=gc.log:time,uptime,level:filecount=10,filesize=100M
```

常用 GC 调优参数：

| 参数 | 说明 |
|------|------|
| `-Xms` / `-Xmx` | 堆初始/最大值，建议设为相同值避免动态扩容 |
| `-Xmn` | 新生代大小 |
| `-XX:SurvivorRatio=8` | Eden 与 Survivor 比例（默认 8） |
| `-XX:MaxTenuringThreshold=15` | 对象晋升老年代的年龄阈值 |
| `-XX:+UseG1GC` | 启用 G1 收集器 |
| `-XX:MaxGCPauseMillis=200` | G1 目标最大停顿时间 |

### GC 调优工具的演变

#### 第一阶段：JDK 自带命令 + 可视化工具

- 命令行：`jps`、`jstat`、`jmap`、`jstack`、`jcmd`
- 可视化：`JConsole`、`Visual VM`、`MAT`
- **痛点**：需登录机器操作；`jmap -dump` 在大堆下会长时间 STW；MAT 需拉 dump 到本地分析；均为事后排查，对生产环境影响大

#### 第二阶段：Arthas（在线诊断，无需重启）

阿里开源，attach 即用，核心能力：

| 命令 | 作用 |
|------|------|
| `dashboard` | 实时查看线程、内存、GC 全貌 |
| `thread` | 定位死锁、高 CPU 线程 |
| `jad` | 反编译，确认线上运行代码 |
| `watch` / `trace` | 方法级监控，查耗时、入参、返回值 |
| `profiler` | 火焰图，定位 CPU 热点 |

#### 第三阶段：AI 辅助诊断

- **日志 / dump 自动分析**：GC 日志、heap dump 丢给 AI，自动定位停顿超标、异常 Full GC、老年代增长趋势，给出调参建议
- **结合 APM 根因分析**：关联 GC、线程栈、链路、系统指标，判断接口抖动与 GC 的因果关系
- **实际工作流**：Arthas 抓数据 → AI 分析给方向 → 人工确认调参。目前 AI 无法完全自动调优，但在缩小排查范围上效率提升明显

AI 辅助的具体方式和技能：

| 方式 | 说明 |
|------|------|
| **直接投喂日志** | 将 GC 日志、线程栈、堆 dump 报告粘贴给 LLM（Claude / ChatGPT 等），让其分析异常点并给出建议 |
| **GCEasy / Datadog 等 AI 平台** | 上传 GC 日志，平台自动生成停顿分布、吞吐量、回收效率等图表和诊断结论 |
| **MCP / Function Calling** | AI 通过工具调用直接读取 Arthas、JMX、APM 数据，实时关联分析而非人工搬运 |
| **Copilot 类 IDE 插件** | 在排查过程中辅助编写排查脚本、解析 dump、生成 JMH 基准测试代码 |
| **Agent 工作流** | 多步骤自动排查：读取指标 → 定位异常 → 抓取上下文 → 给出结论，减少人工串联 |

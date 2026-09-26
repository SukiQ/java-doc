---
title: 类加载
---

# 类加载


## 类的生命周期

一个类从被加载到虚拟机内存开始，到从内存中卸载为止，共经历 7 个阶段：

```
加载 → 验证 → 准备 → 解析 → 初始化 → 使用 → 卸载
 └──── 链接 ────┘
```

其中前五个阶段属于类加载过程，验证/准备/解析合称**链接**。

### 加载（Loading）

- 通过类的全限定名获取定义此类的二进制字节流（从 jar、网络、动态生成等）
- 将字节流转化为方法区的运行时数据结构
- 在堆中生成一个 `Class` 对象，作为方法区数据的访问入口

### 验证（Verification）

确保字节码安全、合法，避免恶意代码危害 JVM：

- **文件格式验证**：魔数、版本号等
- **元数据验证**：语义合法性（如是否有父类、是否继承 final 类）
- **字节码验证**：方法体逻辑合法性（如操作数栈、类型转换）
- **符号引用验证**：解析阶段前，确保引用的类/字段/方法真实存在

### 准备（Preparation）

- 为**类变量**（`static`）分配内存并赋**默认零值**，而非初始值
- 例：`static int a = 123;` 此阶段 a = 0，初始化阶段才赋为 123
- 例外：`static final`（常量）在此阶段直接赋值

### 解析（Resolution）

- 将常量池中的**符号引用**替换为**直接引用**
- 符号引用：字符串形式的引用（如 `java/lang/Object`）
- 直接引用：内存地址 / 偏移量 / 句柄
- 可在初始化前进行，也可延迟到首次使用时（延迟解析）

### 初始化（Initialization）

- 执行类构造器 `<clinit>()`，即执行 `static` 变量赋值和 `static {}` 块
- JVM 保证 `<clinit>()` **线程安全**，多线程同时触发初始化时只有一个线程执行，其余阻塞
- 触发初始化的时机（主动引用）：
  - `new` / `getstatic` / `putstatic` / `invokestatic` 四条字节码指令
  - 反射调用（`Class.forName`）
  - 初始化子类时父类未初始化，先初始化父类
  - JVM 启动时的主类（含 `main` 的类）

### 使用（Using）

- 类已就绪，可正常创建实例、调用方法、访问字段

### 卸载（Unloading）

- 条件苛刻，需同时满足：
  - 该类所有实例已被回收
  - 加载该类的 `ClassLoader` 已被回收
  - 该类对应的 `Class` 对象无引用
- Bootstrap 加载的核心类基本不卸载


## 双亲委派机制是什么？如何打破？

### 委派流程

```
自定义类加载器 收到加载请求
      │ 先问父亲
      ▼
Application ClassLoader ──先问──→ Extension ClassLoader ──先问──→ Bootstrap ClassLoader
      │                              │                              │
      ▼                              ▼                              ▼
  找不到才自己加载              找不到才自己加载              在核心库里找，找到即返回
```

`ClassLoader.loadClass()` 源逻辑：先查缓存（findLoadedClass）→ 未加载则委派父加载器 → 父加载失败才调用自己的 `findClass()`。

### 为什么要双亲委派

| 好处 | 说明 |
|------|------|
| 安全 | 核心 API 不被篡改：自定义的 `java.lang.String` 永远轮不到自己加载 |
| 避免重复加载 | 父加载器已加载的类，子加载器不再加载，保证类的全局唯一（同一 ClassLoader + 同一类名 = 同一个类） |
| 层次清晰 | JDK 内部类由 Bootstrap 加载，应用类由 App 加载，职责明确 |

### 如何打破

三种经典场景：

#### 1. 重写 loadClass()（自定义类加载器）

- 双亲委派的逻辑在 `loadClass()` 里，**重写 `loadClass()` 而不是 `findClass()`** 即可跳过委派，先自己加载
- 注意：`JDK 9+` 后模块化限制，自定义加载器破坏委派的空间变小

#### 2. 线程上下文类加载器（SPI / JDBC）

- 矛盾：`java.sql.DriverManager` 在核心库（Bootstrap 加载），但驱动实现（如 MySQL 驱动）在应用 classpath，**父加载器看不见子加载器的类**
- 解决：`Thread.currentThread().getContextClassLoader()` 把 App 加载器传给核心库，反向加载 SPI 实现
- 这是"逆向委派"，打破了自上而下的委派模型

```java
// ServiceLoader 用线程上下文类加载器加载 SPI 实现
ServiceLoader<Driver> drivers = ServiceLoader.load(Driver.class);
```

#### 3. Tomcat 的 WebappClassLoader

- 目的：**Web 应用间隔离**（两个应用都用同名类的不同版本）+ 优先加载应用自己的类
- 做法：WebappClassLoader 先在自己的仓库里找（WEB-INF/classes、WEB-INF/lib），找不到再委派，与标准顺序相反
- 但 `java.*` 等核心包仍强制委派，保证安全

#### 其他

- OSGi / 热部署：网状加载结构，模块可自己控制加载来源
- 动态代理 / 热更新：破坏委派实现"同名的类可以再次加载"

### 总结

```
双亲委派：子先问父，父找不到才子加载（安全 + 唯一）
打破方式：重写 loadClass()、线程上下文类加载器（SPI）、Tomcat 逆序加载
本质：让"本该父加载器加载的类"由子加载器加载，或反过来
```

面试要点：委派流程与两大好处、SPI 为什么必须打破（Bootstrap 看不到应用类）、Tomcat 隔离的加载顺序、重写 loadClass 与 findClass 的区别。

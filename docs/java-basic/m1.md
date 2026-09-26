---
title: 序列化
---

# 序列化


## 什么是 Java 序列化与反序列化？

**序列化**：把对象转成可存储/传输的字节流（或 JSON 等格式）；**反序列化**：字节流还原为对象。本质是对象的"存档与读档"。

### 为什么需要

| 场景 | 说明 |
|------|------|
| 网络传输 | RPC 调用把请求/响应对象在进程间传递（Dubbo） |
| 缓存存储 | 对象存 Redis 前先序列化成字节/JSON |
| 持久化 | 对象写文件、写数据库 |
| 消息队列 | 消息体跨进程传递（RocketMQ/Kafka） |

### Java 原生序列化

```java
class User implements Serializable {   // 必须实现标记接口
    private static final long serialVersionUID = 1L;
    private String name;
    private transient String password; // transient 不参与序列化
}

ObjectOutputStream out = new ObjectOutputStream(new FileOutputStream("u"));
out.writeObject(user);                 // 序列化
ObjectInputStream in = new ObjectInputStream(new FileInputStream("u"));
User u = (User) in.readObject();       // 反序列化
```

| 要点 | 说明 |
|------|------|
| `Serializable` | 标记接口，无方法，声明"允许被序列化" |
| `serialVersionUID` | 版本号；反序列化时校验，不一致抛 `InvalidClassException`；**必须显式声明**，否则编译器自动生成，类一改就失效 |
| `transient` | 修饰的字段不序列化（密码、缓存字段） |
| `static` 字段 | 不序列化（属于类不属于对象） |

### 主流序列化方式对比

| 方式 | 格式 | 性能 | 跨语言 | 特点 |
|------|------|------|--------|------|
| Java 原生 | 二进制 | 差 | ❌ | 只支持 Java；**反序列化漏洞频发**（readObject 执行任意代码），生产禁用 |
| **JSON**（Jackson/Fastjson） | 文本 | 中 | ✅ | 可读、通用，Web 接口标配 |
| **Hessian** | 二进制 | 好 | ✅ | 紧凑，Dubbo 默认之一 |
| **Protobuf** | 二进制 | **最好** | ✅ | 需 IDL 定义 schema，gRPC 标配 |
| Kryo | 二进制 | 好 | ❌ | Java 生态高性能，Redis 缓存常用 |

### 反序列化的安全问题

- Java 原生反序列化**会执行 readObject 中的逻辑**，攻击者构造恶意字节流可触发任意代码执行（经典漏洞：Apache Commons Collections 链）
- 防护：不反序列化不可信来源的数据；用 JSON 等不含执行语义的格式；白名单过滤

**提示**：面试主线：**定义 → 为什么需要（RPC/缓存/MQ）→ serialVersionUID 与 transient 两个关键字 → 原生序列化禁用的安全原因 → 生产用 JSON/Protobuf**。

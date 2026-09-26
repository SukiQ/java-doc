---
title: 反射
---

# 反射


## 什么是 Java 反射机制？

程序在**运行期**动态获取任意类的信息（构造器、方法、字段）并调用操作它的能力——无需在编译期知道这个类是什么。

### 三种获取 Class 的方式

```java
Class<?> c1 = String.class;                 // 类字面量
Class<?> c2 = "abc".getClass();             // 对象实例
Class<?> c3 = Class.forName("java.lang.String");  // 全限定名（常用，可加载任意类）
```

### 能做什么

```java
Class<?> c = Class.forName("com.demo.User");
Object obj = c.getDeclaredConstructor().newInstance();     // 创建实例
Method m = c.getDeclaredMethod("setName", String.class);   // 获取方法
m.setAccessible(true);                                      // 突破 private
m.invoke(obj, "tom");                                       // 调用
Field f = c.getDeclaredField("name");                       // 读写字段
```

| 能力 | API |
|------|-----|
| 创建实例 | `newInstance()` / `getDeclaredConstructor().newInstance()` |
| 调用任意方法（含 private） | `getDeclaredMethod` + `setAccessible(true)` + `invoke` |
| 读写字段 | `getDeclaredField` + get/set |
| 获取注解/泛型/父类/接口 | `getAnnotation`、`getGenericSuperclass` 等 |

### 应用场景

| 场景 | 说明 |
|------|------|
| **Spring IoC** | 按配置/注解反射创建 Bean、@Autowired 注入 |
| **MyBatis** | Mapper 接口无实现类，JDK 动态代理 + 反射执行 SQL |
| **序列化框架** | Jackson/Gson 反射读写字段 |
| 动态代理 | `InvocationHandler` 里 `method.invoke(target, args)` |

### 优缺点

| 优点 | 缺点 |
|------|------|
| 灵活：运行期动态装配，框架的基础 | 性能低于直接调用（JIT 难优化，高频可用 MethodHandle/缓存 Method） |
| 解耦：编译期不依赖具体类 | 破坏封装：`setAccessible(true)` 可绕过 private |
| | 无法在编译期做类型检查，错误推迟到运行期 |

**注**：反射是**动态代理**的底层（JDK 代理的 InvocationHandler 最终靠 method.invoke 调目标对象）。

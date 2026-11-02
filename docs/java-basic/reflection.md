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

- 创建实例

```java
Object obj = c.getDeclaredConstructor().newInstance();     // 创建实例
```

- 调用方法

```java
Method m = c.getDeclaredMethod("setName", String.class);   // 获取方法
m.invoke(obj, "tom");                                       // 调用
```


- 读写字段

```java
Field f = c.getDeclaredField("name");                       // 读写字段
```


- 获取注解/泛型/父类/接口

```java
Object obj = c.class.getAnnotatedInterfaces();     // 获取注解
```
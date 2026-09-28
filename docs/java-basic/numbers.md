---
title: 数值
---

# 数值


## 为什么不能用浮点数表示金额？

float/double 是 **IEEE 754 二进制浮点数**——用二进制科学计数法存储，而多数十进制小数在二进制下是**无限循环小数**，无法精确表示，只能近似存储。

```java
System.out.println(0.1 + 0.2);        // 0.30000000000000004
System.out.println(0.1 + 0.2 == 0.3); // false
System.out.println(1.03 - 0.42);      // 0.6100000000000001
```

| 方案 | 做法 | 适用 |
|------|------|------|
| **BigDecimal** | 字符串构造 + 显式舍入模式 | 金额计算的主流选择 |
| **整数分存储** | 以"分"为单位用 `long`，如 999 元 = 99900 | 高性能场景、交易系统 |

```java
// ✅ 字符串构造，精确
BigDecimal a = new BigDecimal("0.1");
// ❌ double 构造，照样不精确（把近似值原样存下来）
BigDecimal b = new BigDecimal(0.1);
// ✅ 必要时用 valueOf（走 Double.toString 的规范表示）
BigDecimal c = BigDecimal.valueOf(0.1);

// 除不尽必须指定精度和舍入模式，否则抛 ArithmeticException
a.divide(new BigDecimal("3"), 2, RoundingMode.HALF_UP);
```
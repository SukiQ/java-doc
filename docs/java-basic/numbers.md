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



## BigDecimal 怎么比较大小？

一律用 **compareTo**，别用 equals——equals 连 **scale（小数位数）**一起比，`1.0` 和 `1.00` 不相等；compareTo 只比数值。

```java
new BigDecimal("1.0").equals(new BigDecimal("1.00"));    // false（scale 不同）
new BigDecimal("1.0").compareTo(new BigDecimal("1.00")); // 0（数值相等）

// 返回值：负数 = 小于，0 = 等于，正数 = 大于
if (a.compareTo(b) > 0)  { /* a > b */ }
if (a.compareTo(b) == 0) { /* a == b */ }
```

| 追问 | 答案 |
|------|------|
| 放进 HashSet/HashMap | `1.0` 和 `1.00` 是**两个 key**（按 equals/hashCode，hashCode 也含 scale） |
| 放进 TreeMap/TreeSet | 按 compareTo，`1.0` 和 `1.00` 算**同一个 key** |
---
title: Bean 生命周期
---

# Bean 生命周期


## Spring Bean 的生命周期？

```
实例化 → 属性注入 → Aware 回调 → BeanPostProcessor 前置
→ 初始化（@PostConstruct → InitializingBean → init-method）
→ BeanPostProcessor 后置（AOP 代理在这里生成）→ 使用 → 销毁
```

| 阶段 | 说明 | 关键接口/注解 |
|------|------|----------------|
| **实例化** | 反射调构造器创建对象（未赋值） | 构造器 |
| **属性注入** | 填充依赖的属性（@Autowired 等） | InstantiationAwareBeanPostProcessor |
| **Aware 回调** | 拿到容器相关组件 | BeanNameAware、BeanFactoryAware、ApplicationContextAware |
| **初始化前** | BeanPostProcessor 前置处理 | postProcessBeforeInitialization |
| **初始化** | 三个初始化方法**按此顺序**执行 | @PostConstruct → afterPropertiesSet() → init-method |
| **初始化后** | 后置处理，**AOP 代理在此生成** | postProcessAfterInitialization（AbstractAutoProxyCreator） |
| **使用** | 放入单例池，正常使用 | |
| **销毁** | 容器关闭时，顺序与初始化对应 | @PreDestroy → destroy() → destroy-method |

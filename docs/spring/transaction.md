# 事务


## Spring 事务的实现原理？

核心：**AOP 动态代理 + 事务管理器（PlatformTransactionManager）**——@Transactional 方法被代理拦截，在前后开启/提交/回滚事务。

### 工作流程

1. **代理拦截**：调用 bean 的事务方法 → 实际调用的是代理对象（CGLIB/JDK 动态代理）
2. **获取事务**：TransactionManager 从连接池拿 Connection，设 `autoCommit=false`，开启事务（把连接绑定到 ThreadLocal——DataSourceTransactionManager 的 `ConnectionHolder`）
3. **执行业务**：方法体内的 SQL 都走这个 ThreadLocal 里的连接——**同一事务**
4. **提交/回滚**：无异常 → commit；捕获到 `RuntimeException`/`Error` → rollback（`rollbackFor` 可扩展）
5. **恢复**：恢复 autoCommit、归还连接、清理 ThreadLocal

### 三大组件

| 组件 | 作用 |
|------|------|
| **@Transactional** | 声明事务属性（传播行为、隔离级别、超时、回滚规则） |
| **PlatformTransactionManager** | 事务管理器：数据源事务用 DataSourceTransactionManager，JPA 用 JpaTransactionManager |
| **TransactionInterceptor** | AOP 拦截器，把上面两者串起来（事务切面的逻辑载体） |

### 五大传播行为

| 传播行为 | 含义 |
|----------|------|
| **REQUIRED**（默认） | 有事务加入，没有就新建 |
| REQUIRES_NEW | **挂起当前**，总是开新事务（内外独立，内回滚不影响外） |
| NESTED | 嵌套事务（保存点 savepoint），内回滚到保存点，外可继续 |
| SUPPORTS | 有就加入，没有就非事务跑 |
| NOT_SUPPORTED / NEVER / MANDATORY | 挂起事务跑 / 有事务报错 / 没事务报错 |

### 失效场景（高频追问）

| 场景 | 原因 |
|------|------|
| **同类内部调用** | this.method() 不走代理 → 事务失效（最经典） |
| 方法非 public | 代理拦截不到 |
| 异常被 try-catch 吞掉 | 拦截器感知不到异常 |
| 默认只回滚 RuntimeException | 受检异常要 `rollbackFor = Exception.class` |
| 多线程 | 连接绑在 ThreadLocal，子线程不在同一事务 |
| 引擎不支持 | MyISAM 无事务 |

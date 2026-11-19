import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    lang: 'zh-CN',
    base: '/java-doc/',
    title: 'Java 学习笔记',
    description: 'Java 后端个人知识库：Java 基础 / JVM / JUC / 数据库 / Redis / RocketMQ / Kafka / Spring / 架构 / 设计模式',
    themeConfig: {
      nav: [
        { text: "Java 基础", link: "/java-basic/", activeMatch: "/java-basic/" },
        { text: "JVM", link: "/jvm/", activeMatch: "/jvm/" },
        { text: "JUC", link: "/juc/", activeMatch: "/juc/" },
        { text: "数据库", link: "/database/", activeMatch: "/database/" },
        { text: "Redis", link: "/redis/basic", activeMatch: "/redis/" },
        { text: "RocketMQ", link: "/rocketmq/", activeMatch: "/rocketmq/" },
        { text: "Kafka", link: "/kafka/basic", activeMatch: "/kafka/" },
        { text: "Spring", link: "/spring/", activeMatch: "/spring/" },
        { text: "架构", link: "/architecture/", activeMatch: "/architecture/" },
        { text: "设计模式", link: "/design-pattern/", activeMatch: "/design-pattern/" }
      ],
      sidebar: [
    {
      text: "Java 基础",
      collapsed: false,
      items: [
        { text: "数值", link: "/java-basic/numbers" },
        { text: "String", link: "/java-basic/string" },
        { text: "序列化", link: "/java-basic/serialization" },
        { text: "反射", link: "/java-basic/reflection" },
        { text: "集合框架", link: "/java-basic/collections" }
      ]
    },
    {
      text: "JVM",
      collapsed: false,
      items: [
        { text: "JVM 内存结构", link: "/jvm/memory" },
        { text: "类加载", link: "/jvm/class-loading" },
        { text: "垃圾回收", link: "/jvm/gc" }
      ]
    },
    {
      text: "JUC",
      collapsed: false,
      items: [
        { text: "线程基础", link: "/juc/thread-basics" },
        { text: "线程池", link: "/juc/thread-pool" },
        { text: "JMM 并发模型", link: "/juc/jmm" },
        { text: "原子类", link: "/juc/atomic" },
        { text: "锁", link: "/juc/locks" },
        { text: "并发工具", link: "/juc/concurrent-tools" },
        { text: "并发容器", link: "/juc/concurrent-containers" }
      ]
    },
    {
      text: "数据库",
      collapsed: false,
      items: [
        { text: "索引", link: "/database/index" },
        { text: "SQL 优化", link: "/database/sql-optimization" },
        { text: "事务", link: "/database/transaction" },
        { text: "死锁", link: "/database/dead-locks" },
        { text: "日志", link: "/database/logs" },
        { text: "存储引擎", link: "/database/storage-engines" },
        { text: "高可用", link: "/database/high-availability" },
        { text: "其他数据库", link: "/database/other-databases" }
      ]
    },
    {
      text: "Redis",
      collapsed: false,
      items: [
        { text: "基础与数据结构", link: "/redis/basic" },
        { text: "持久化与内存", link: "/redis/persistence" },
        { text: "主从与集群", link: "/redis/high-availability" },
        { text: "缓存与分布式锁", link: "/redis/cache" }
      ]
    },
    {
      text: "RocketMQ",
      collapsed: false,
      items: [
        { text: "架构", link: "/rocketmq/architecture" },
        { text: "可靠性", link: "/rocketmq/reliability" }
      ]
    },
    {
      text: "Kafka",
      collapsed: false,
      items: [
        { text: "基础与架构", link: "/kafka/basic" },
        { text: "生产者", link: "/kafka/producer" },
        { text: "消费者", link: "/kafka/consumer" },
        { text: "高可用与运维", link: "/kafka/high-availability" }
      ]
    },
    {
      text: "Spring",
      collapsed: false,
      items: [
        { text: "IoC 容器", link: "/spring/ioc" },
        { text: "Bean 生命周期", link: "/spring/bean-lifecycle" },
        { text: "启动优化", link: "/spring/startup-optimization" },
        { text: "事务", link: "/spring/transaction" },
        { text: "Spring MVC", link: "/spring/spring-mvc" }
      ]
    },
    {
      text: "架构",
      collapsed: false,
      items: [
        { text: "高并发设计", link: "/architecture/high-concurrency" },
        { text: "分布式任务", link: "/architecture/distributed-task" },
        { text: "分布式 ID", link: "/architecture/distributed-id" },
        { text: "IO", link: "/architecture/io" }
      ]
    },
    {
      text: "设计模式",
      collapsed: false,
      items: [
        { text: "总览", link: "/design-pattern/overview" }
      ]
    }
      ],
      outline: { level: [2, 3] }
    },
    mermaid: {
      theme: 'neutral',
      htmlLabels: false,
      themeVariables: {
        fontSize: '13px',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      },
      flowchart: {
        curve: 'linear',
        nodeSpacing: 32,
        rankSpacing: 40,
        padding: 8,
      },
    },
    vite: {
      optimizeDeps: {
        include: ['mermaid'],
      },
    },
  })
)

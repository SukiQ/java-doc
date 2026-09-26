import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    lang: 'zh-CN',
    base: '/java-doc/',
    title: 'Java 面试笔记',
    description: 'Java 后端面试知识库：Java 基础 / JVM / JUC / 数据库 / RocketMQ / Spring / 架构 / 设计模式',
    themeConfig: {
      nav: [
        { text: "Java 基础", link: "/java-basic/", activeMatch: "/java-basic/" },
        { text: "JVM", link: "/jvm/", activeMatch: "/jvm/" },
        { text: "JUC", link: "/juc/", activeMatch: "/juc/" },
        { text: "数据库", link: "/database/", activeMatch: "/database/" },
        { text: "RocketMQ", link: "/rocketmq/", activeMatch: "/rocketmq/" },
        { text: "Spring", link: "/spring/", activeMatch: "/spring/" },
        { text: "架构", link: "/architecture/", activeMatch: "/architecture/" },
        { text: "设计模式", link: "/design-pattern/", activeMatch: "/design-pattern/" }
      ],
      sidebar: [
    {
      text: "Java 基础",
      collapsed: false,
      items: [
        { text: "String", link: "/java-basic/string" },
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
        { text: "锁", link: "/database/locks" },
        { text: "日志", link: "/database/logs" },
        { text: "存储引擎", link: "/database/storage-engines" },
        { text: "高可用", link: "/database/high-availability" },
        { text: "MongoDB", link: "/database/mongodb" }
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
        { text: "分布式任务", link: "/architecture/distributed-task" }
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
    mermaid: {},
  })
)

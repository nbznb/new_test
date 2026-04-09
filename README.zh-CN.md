[English](README.md) | **中文**

# Follow USTC

一个 AI 驱动的信息摘要项目，用于跟踪中科大官方信息、教务通知、可选学院新闻、精选科技资讯和科研论文动态，并将其整理成结构更清晰、优先级更明确的高信号简报。

## 你会得到什么

每日或每周摘要，包含：

- USTC 官方新闻与通知
- 教务处与教学相关公告
- 并入官方分区的可选学院新闻
- 公开科技资讯源的精选内容
- 公开论文 feed 的研究亮点
- 所有原始链接
- 英文、中文或双语输出

## 阅读体验

这个 digest 的目标不是把内容简单堆在一起，而是做成一份适合快速扫读的校园 + 科研简报。典型结构包括：

- 顶部 **重点必看 / Important reminders**，优先呈现 deadline、必须处理的事项和高优先级变化
- 分区展示 **USTC 官方动态**（包含所选学院新闻）、**教务 / 通知**、**科技资讯**、**科研 / AI 前沿**
- 每条内容统一采用：标题、`What matters` 一句话结论、少量要点、原始链接
- 更短段落与更清晰留白，适合手机端阅读

因此，Follow USTC 更像一份完整的信息简报，而不是松散的摘要列表。

## 快速开始

1. 在 agent 中安装该 skill
2. 输入 “set up follow USTC”
3. agent 会通过对话完成设置

内容源不需要 API key，公共内容由中心化 feed 获取。

## 架构

- `config/default-sources.json` 定义数据源，其中学院站点并入 `official` 来源组
- `scripts/generate-feed.js` 抓取并生成 feeds
- `scripts/prepare-digest.js` 汇总 feeds、prompts 和配置给 LLM，并根据 `officialFilters.includeAcademies` 过滤学院新闻
- `scripts/deliver.js` 负责 stdout、Telegram 或邮件投递
- `prompts/` 控制摘要风格与最终 digest 结构

## 默认内容分类

- USTC 官方新闻与通知
- USTC 教务处更新
- 并入官方分区的学院新闻
- 公开科技资讯 feed
- 公开科研论文 feed

## 学院选择机制

当前没有单独前端 UI，学院选择通过 `~/.follow-ustc/config.json` 配置完成。例如：

```json
{
  "officialFilters": {
    "includeAcademies": ["math", "physics"]
  }
}
```

含义示例：

- `[]`：不展示任何学院新闻
- `["math"]`：只展示数学科学学院新闻
- `["math", "physics"]`：展示多个学院新闻

非学院类 official 来源不会因为学院白名单而被过滤。

## 安装

### Claude Code
```bash
cd ~/.claude/skills/follow-USTC/scripts && npm install
```

## 系统要求

- Claude Code 或类似 AI agent
- 网络连接

## 工作原理

1. 中心化 feed 定时从公开来源更新
2. agent 拉取 feed 与本地配置
3. LLM 将原始条目重组为带优先级和分区结构的 digest
4. 摘要在聊天中展示或通过所选渠道发送

## 许可证

MIT

# 更新日志

## [1.1.0] - 2024-01-12

### 重大变更 (Breaking Changes)
- 🚨 **参数名变更**: `TXT_MSG` → `MSG_TEXT`
- 🚨 **功能简化**: 移除了复杂的 Markdown 处理逻辑，现在直接使用原始 Markdown 内容

### 新增
- 使用新的简化 JSON 格式发送 Markdown 消息：`{"elements": [{"tag": "markdown", "content": "MSG_TEXT_RAW"}]}`
- 用户可以直接在 Markdown 中编写链接，如 `[A](http://example.com)`，无需额外处理

### 移除
- 移除了所有复杂的 Markdown 处理函数（`processMarkdownContent`、`cleanMarkdownSyntax`、`processAtMentions` 等）
- 移除了复杂的卡片构建函数（`buildFeishuMarkdownCard`、`buildI18nFeishuMarkdownCard`、`createSuccessCard` 等）
- 移除了不再需要的接口和常量定义（`MarkdownCardElement`、`FEISHU_ICONS` 等）
- 移除了过时的功能文档 `MARKDOWN_FEATURES.md`

### 修复
- 🐛 **修复签名算法**: 纠正了 HMAC-SHA256 签名实现，现在正确使用 secret 作为 key
- 🐛 **修复模板变量替换**: 修复了模板中的 `_RAW` 和 `_URL` 变量名大小写问题，现在所有变量都能正确替换

### 改进
- 📝 更新了 README.md 文档以反映新的简化功能
- 📝 更新了 `action.yml` 中的参数描述
- 🏗️ 代码结构大幅简化，提高了可维护性
- ⚡ 性能提升，减少了不必要的文本处理开销

## [1.0.12] - 2024-01-11

### 新增
- 将项目改造为标准的 GitHub Action
- 添加 `TXT_MSG` 参数支持，可以发送自定义文本消息
- 添加 `action.yml` 配置文件
- 添加完整的 README.md 文档
- 添加示例工作流文件
- 添加发布脚本

### 改进
- 重构代码结构，使用标准的 Action 入口点
- 改进错误处理和日志输出
- 优化消息模板格式
- 支持环境变量配置
- 统一参数命名：`webhook` → `FEISHU_BOT_WEBHOOK`，`signkey` → `FEISHU_BOT_SIGNKEY`

### 修复
- 修复 TypeScript 配置问题
- 修复构建脚本路径问题

### 技术细节
- 使用 `@vercel/ncc` 进行代码打包
- 支持 Node.js 20+
- 添加 TypeScript 类型定义
- 改进代码可维护性

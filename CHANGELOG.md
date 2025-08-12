# 更新日志

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

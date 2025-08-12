# Feishu Bot Webhook Action

一个用于发送消息到飞书机器人的 GitHub Action。

## 功能特性

- 支持发送文本消息
- 支持发送 GitHub 事件模板消息
- 支持飞书机器人签名验证
- 自动处理 GitHub 事件信息
- [飞书卡片消息](https://open.feishu.cn/tool/cardbuilder?from=cotentmodule)

## 使用方法

### 基本用法

```yaml
name: Send to Feishu
on:
  push:
    branches: [ main ]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send notification to Feishu
        uses: XRSec/feishu-bot-webhook-action@v1
        with:
          FEISHU_BOT_WEBHOOK: ${{ secrets.FEISHU_BOT_WEBHOOK }}
          FEISHU_BOT_SIGNKEY: ${{ secrets.FEISHU_BOT_SIGNKEY }}
```

### 发送自定义文本消息

```yaml
name: Send Custom Message
on:
  workflow_dispatch:

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send custom message to Feishu
        uses: XRSec/feishu-bot-webhook-action@v1
        with:
          FEISHU_BOT_WEBHOOK: ${{ secrets.FEISHU_BOT_WEBHOOK }}
          FEISHU_BOT_SIGNKEY: ${{ secrets.FEISHU_BOT_SIGNKEY }}
          TXT_MSG: "部署完成！🎉"
```

### 在多个事件中触发

```yaml
name: Notify on Events
on:
  push:
    branches: [ main ]
  pull_request:
    types: [ opened, synchronize, closed ]
  issues:
    types: [ opened, closed ]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send notification to Feishu
        uses: XRSec/feishu-bot-webhook-action@v1
        with:
          FEISHU_BOT_WEBHOOK: ${{ secrets.FEISHU_BOT_WEBHOOK }}
          FEISHU_BOT_SIGNKEY: ${{ secrets.FEISHU_BOT_SIGNKEY }}
```

## 输入参数

| 参数名 | 必需 | 描述 |
|--------|------|------|
| `FEISHU_BOT_WEBHOOK` | 是 | 飞书机器人的 webhook URL |
| `FEISHU_BOT_SIGNKEY` | 否 | 飞书机器人的签名密钥 |
| `TXT_MSG` | 否 | 要发送的文本消息。如果不为空，将直接发送文本消息；否则发送 GitHub 事件模板消息 |

## 环境变量

你也可以通过环境变量来设置参数：

- `FEISHU_BOT_WEBHOOK`: 飞书机器人的 webhook URL
- `FEISHU_BOT_SIGNKEY`: 飞书机器人的签名密钥

## 消息模板

当 `TXT_MSG` 为空时，Action 会发送格式化的 GitHub 事件消息，包含以下信息：

- 项目名称
- 事件类型
- 分支信息
- 提交信息（显示前16位）
- 最近一次提交内容
- 操作人
- 状态
- 查看详情链接

## 设置飞书机器人

1. 在飞书中创建一个机器人
2. 获取 webhook URL
3. 如果需要签名验证，获取签名密钥
4. 在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加以下 secrets：
   - `FEISHU_BOT_WEBHOOK`: 你的 webhook URL
   - `FEISHU_BOT_SIGNKEY`: 你的签名密钥（可选）

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 测试发送效果
./test-send.sh
```

### 测试发送效果

1. **设置环境变量：**
   ```bash
   export FEISHU_BOT_WEBHOOK='https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-id'
   export FEISHU_BOT_SIGNKEY='your-sign-key'  # 可选
   ```

2. **运行测试：**
   ```bash
   ./test-send.sh
   ```

3. **调试模式测试（强制使用测试数据）：**
   ```bash
   ./test-debug.sh
   ```

4. **或者直接运行：**
   ```bash
   # 普通模式
   node dist/index.js
   
   # 调试模式
   DEBUG_MODE=true node dist/index.js
   ```

### 调试模式

设置 `DEBUG_MODE=true` 或 `DEBUG_MODE=1` 环境变量可以强制使用测试数据，即使有 GitHub 事件上下文也会使用测试数据。

**注意：** 当没有 GitHub 事件上下文时，Action 会自动使用内置的测试数据发送消息。

### 发布新版本

```bash
# 更新 package.json 中的版本号
# 然后运行发布脚本
npm run release
```

## 注意事项

- 确保飞书机器人的 webhook URL 格式正确
- 如果使用签名验证，请确保签名密钥正确
- 文本消息支持 Markdown 格式
- 模板消息会自动根据 GitHub 事件生成

## 许可证

ISC

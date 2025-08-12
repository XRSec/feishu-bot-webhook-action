# 飞书卡片 Markdown 增强功能

本项目已增强了 Markdown 处理能力，支持飞书卡片的富文本特性。

## 新增功能

### 1. 智能 Markdown 解析
- 自动清理和标准化 Markdown 语法
- 支持粗体、斜体、删除线、代码、引用等标准格式
- 自动处理换行符和空格

### 2. @用户 提醒支持
```markdown
@all                    # 提及所有人
@username               # 提及特定用户
@user_id                # 提及用户ID
```

自动转换为飞书格式：`<at id=username></at>`

### 3. Emoji 支持
- 📧 Unicode emoji 原生支持
- :smile: 自定义 emoji 格式支持

### 4. 智能链接处理
- 自动将纯 URL 转换为链接格式
- 支持邮箱地址自动链接
- 避免重复处理已存在的 Markdown 链接
- 自动生成多平台 href 对象

### 5. 内容验证
- 检查内容长度限制
- 识别不支持的 HTML 标签
- 验证图片链接格式
- 提供警告和错误信息

## 使用方法

### 基础用法
```typescript
const cardData = buildFeishuMarkdownCard("标题", markdownText);
```

### 高级用法
```typescript
const cardData = buildFeishuMarkdownCard("标题", markdownText, {
  text_size: "heading",           // "normal" | "heading"
  text_align: "center",           // "left" | "center" | "right"
  icon: FEISHU_ICONS.SUCCESS,     // 预定义图标
  enableAtParsing: true,          // 启用 @用户 解析
  enableEmojiParsing: true,       // 启用 emoji 处理
  enableLinkParsing: true         // 启用链接处理
});
```

### 快捷方法
```typescript
// 成功消息
const successCard = createSuccessCard("部署成功", "应用已成功部署到生产环境");

// 错误消息
const errorCard = createErrorCard("构建失败", "编译过程中出现错误");

// 警告消息
const warningCard = createWarningCard("注意", "检测到潜在的安全问题");

// 信息消息
const infoCard = createInfoCard("更新通知", "新版本已发布");
```

### 多语言支持
```typescript
const i18nCard = buildI18nFeishuMarkdownCard("标题", markdownText, options);
```

## 预定义图标

可以使用 `FEISHU_ICONS` 常量：

```typescript
FEISHU_ICONS.SUCCESS    // 成功图标（绿色）
FEISHU_ICONS.ERROR      // 错误图标（红色）
FEISHU_ICONS.WARNING    // 警告图标（橙色）
FEISHU_ICONS.INFO       // 信息图标（蓝色）
FEISHU_ICONS.CODE       // 代码图标（紫色）
FEISHU_ICONS.GIT        // Git 图标（橙色）
// ... 更多图标
```

## 示例

### 完整的 Markdown 消息
```markdown
**🎉 构建完成通知**

## 构建信息
- **状态**: ✅ 成功
- **分支**: main
- **提交**: abc123

### 主要变更
1. 修复了登录问题
2. 优化了性能
3. 新增了功能

> 💡 提示：@all 请查看最新的部署文档

相关链接：
- [项目主页](https://github.com/user/repo)
- [部署文档](https://docs.example.com)
- 直接访问：https://app.example.com

如有问题请联系：admin@example.com
```

这段 Markdown 会被自动处理为完全兼容飞书卡片的格式，包括：
- 正确的 @all 提醒
- 自动链接处理
- Emoji 保留
- 多平台 URL 支持

## 注意事项

1. 内容长度建议不超过 10000 字符
2. 避免使用不支持的 HTML 标签
3. 图片链接需要使用完整的 HTTP/HTTPS URL
4. 表格语法支持有限，建议使用列表代替
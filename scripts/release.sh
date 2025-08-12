#!/bin/bash

# 发布脚本
echo "开始构建和发布 Feishu Bot Webhook Action..."

# 构建项目
echo "构建项目..."
npm run build

# 检查构建是否成功
if [ ! -f "dist/index.js" ]; then
    echo "构建失败！dist/index.js 文件不存在"
    exit 1
fi

echo "构建成功！"

# 创建 git tag
echo "创建 git tag..."
VERSION=$(node -p "require('./package.json').version")
git add .
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main
git push origin "v$VERSION"

echo "发布完成！版本: v$VERSION"
echo "现在可以在其他仓库中使用: XRSec/feishu-bot-webhook-action@v$VERSION"

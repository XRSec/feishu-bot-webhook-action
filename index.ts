import * as core from '@actions/core'
import { context } from '@actions/github'
import * as https from 'https'
import * as crypto from 'crypto'
import * as child from 'child_process'

/**
 * 飞书卡片 Markdown 元素的接口定义
 */
interface MarkdownCardElement {
  tag: "markdown";
  content: string;
  text_size?: "normal" | "heading";
  text_align?: "left" | "center" | "right";
  icon?: {
    tag: "standard_icon" | "custom_icon";
    token?: string;
    color?: string;
    img_key?: string;
  };
  href?: Record<
    string,
    {
      url: string;
      pc_url?: string;
      ios_url?: string;
      android_url?: string;
    }
  >;
}

/**
 * 常用的飞书标准图标
 */
const FEISHU_ICONS = {
  // 状态图标
  SUCCESS: { tag: "standard_icon" as const, token: "success_outlined", color: "green" },
  ERROR: { tag: "standard_icon" as const, token: "error_outlined", color: "red" },
  WARNING: { tag: "standard_icon" as const, token: "warning_outlined", color: "orange" },
  INFO: { tag: "standard_icon" as const, token: "info_outlined", color: "blue" },
  
  // 功能图标
  CHAT: { tag: "standard_icon" as const, token: "chat_outlined", color: "blue" },
  NOTIFICATION: { tag: "standard_icon" as const, token: "notification_outlined", color: "orange" },
  SETTINGS: { tag: "standard_icon" as const, token: "settings_outlined", color: "gray" },
  LINK: { tag: "standard_icon" as const, token: "link_outlined", color: "blue" },
  
  // 开发相关
  CODE: { tag: "standard_icon" as const, token: "code_outlined", color: "purple" },
  GIT: { tag: "standard_icon" as const, token: "git_outlined", color: "orange" },
  BUILD: { tag: "standard_icon" as const, token: "build_outlined", color: "green" },
  DEPLOY: { tag: "standard_icon" as const, token: "deploy_outlined", color: "blue" },
  
  // 文档相关
  DOC: { tag: "standard_icon" as const, token: "doc_outlined", color: "blue" },
  FOLDER: { tag: "standard_icon" as const, token: "folder_outlined", color: "yellow" },
  FILE: { tag: "standard_icon" as const, token: "file_outlined", color: "gray" },
} as const;

/**
 * Markdown 文本处理选项
 */
interface MarkdownProcessOptions {
  text_size?: "normal" | "heading";
  text_align?: "left" | "center" | "right";
  icon?: MarkdownCardElement['icon'];
  enableAtParsing?: boolean;
  enableEmojiParsing?: boolean;
  enableLinkParsing?: boolean;
}

/**
 * 解析和清理 Markdown 文本，确保兼容飞书卡片
 * @param markdownText 原始 Markdown 文本
 * @param options 处理选项
 */
function processMarkdownContent(markdownText: string, options: MarkdownProcessOptions = {}): string {
  let processed = markdownText;
  
  // 清理和标准化 Markdown 语法
  processed = cleanMarkdownSyntax(processed);
  
  // 处理 @用户 语法
  if (options.enableAtParsing !== false) {
    processed = processAtMentions(processed);
  }
  
  // 处理 emoji（保持原样，飞书支持标准 emoji）
  if (options.enableEmojiParsing !== false) {
    processed = processEmojis(processed);
  }
  
  // 处理超链接
  if (options.enableLinkParsing !== false) {
    processed = processLinks(processed);
  }
  
  return processed;
}

/**
 * 清理和标准化 Markdown 语法
 */
function cleanMarkdownSyntax(text: string): string {
  return text
    // 标准化换行符
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 移除多余的空行（保留最多2个连续换行）
    .replace(/\n{3,}/g, '\n\n')
    // 清理行尾空格
    .replace(/ +$/gm, '')
    // 标准化列表语法
    .replace(/^[ \t]*[\*\+\-][ \t]/gm, '- ')
    .replace(/^[ \t]*(\d+)\.[ \t]/gm, '$1. ')
    // 标准化代码块
    .replace(/```(\w*)\n/g, '```$1\n')
    // 标准化引用块
    .replace(/^[ \t]*>[ \t]?/gm, '> ')
    // 修复粗体和斜体语法
    .replace(/\*\*([^*]+)\*\*/g, '**$1**')
    .replace(/\*([^*]+)\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '**$1**')
    .replace(/_([^_]+)_/g, '*$1*')
    // 修复删除线语法
    .replace(/~~([^~]+)~~/g, '~~$1~~')
    // 修复行内代码
    .replace(/`([^`]+)`/g, '`$1`');
}

/**
 * 处理 @用户 语法，转换为飞书支持的格式
 */
function processAtMentions(text: string): string {
  return text
    // 处理 @all（全体成员）
    .replace(/@all\b/g, '<at id=all></at>')
    // 处理 @用户名 或 @user_id（但排除邮箱地址）
    .replace(/@([a-zA-Z0-9_-]+)(?!@|[a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/g, '<at id=$1></at>')
    // 处理已经是正确格式的 @mentions（保持不变）
    .replace(/<at id=([^>]+)><\/at>/g, '<at id=$1></at>');
}

/**
 * 处理 emoji，确保格式正确
 */
function processEmojis(text: string): string {
  // 飞书支持标准的 Unicode emoji 和自定义 emoji 格式
  // 这里保持 emoji 原样，飞书会自动渲染
  return text
    // 处理自定义 emoji 格式 :emoji_name:
    .replace(/:([a-zA-Z0-9_+-]+):/g, ':$1:')
    // 保持 Unicode emoji 不变 - 使用兼容的正则表达式
    .replace(/([\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF]|[\uD83C][\uDF00-\uDFFF]|[\uD83D][\uDC00-\uDE4F]|[\uD83D][\uDE80-\uDEFF])/g, '$1');
}

/**
 * 处理超链接，确保格式正确且支持多平台
 */
function processLinks(text: string): string {
  let processed = text;
  
  // 使用更简单的方法：分步处理，避免重复
  
  // 第一步：处理纯 URL，但排除已经在 Markdown 链接中的
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const existingLinks: string[] = [];
  let match;
  
  // 提取现有链接
  while ((match = linkRegex.exec(text)) !== null) {
    existingLinks.push(match[0]);
  }
  
  // 处理纯 URL（不在现有链接中的）
  processed = processed.replace(/(^|[^(\[])(https?:\/\/[^\s<>()[\]{}]+)([^)\]]|$)/g, (fullMatch, before, url, after) => {
    // 检查这个 URL 是否已经在现有链接中
    const isInExistingLink = existingLinks.some(link => link.includes(url));
    if (isInExistingLink) {
      return fullMatch;
    }
    return `${before}[${url}](${url})${after}`;
  });
  
  // 第二步：处理邮箱（不在现有链接中的）
  processed = processed.replace(/(^|[^(\[]|[^@])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})([^)\]]|$)/g, (fullMatch, before, email, after) => {
    // 检查这个邮箱是否已经在链接中
    if (before.includes('](') || after.includes(')') || fullMatch.includes('](')) {
      return fullMatch;
    }
    return `${before}[${email}](mailto:${email})${after}`;
  });
  
  return processed;
}

/**
 * 提取 Markdown 文本中的链接，用于构建 href 对象
 */
function extractLinksForHref(text: string): Record<string, { url: string; pc_url?: string; ios_url?: string; android_url?: string; }> {
  const href: Record<string, any> = {};
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let linkIndex = 0;
  
  while ((match = linkRegex.exec(text)) !== null) {
    const [, linkText, url] = match;
    const linkKey = `link_${linkIndex++}`;
    
    href[linkKey] = {
      url: url,
      pc_url: url, // 默认所有平台使用相同 URL
      ios_url: url,
      android_url: url
    };
  }
  
  return href;
}

/**
 * 创建飞书卡片的 Markdown 元素
 * @param mdText 纯 Markdown 文本
 * @param options 额外配置，比如 text_size / text_align / icon / href
 */
function buildMarkdownElement(
  mdText: string,
  options: Partial<Omit<MarkdownCardElement, "tag" | "content">> & MarkdownProcessOptions = {}
): MarkdownCardElement {
  // 处理 Markdown 内容
  const processedContent = processMarkdownContent(mdText, options);
  
  // 构建基础元素
  const element: MarkdownCardElement = {
    tag: "markdown",
    content: processedContent,
  };
  
  // 添加可选属性
  if (options.text_size) {
    element.text_size = options.text_size;
  }
  
  if (options.text_align) {
    element.text_align = options.text_align;
  }
  
  if (options.icon) {
    element.icon = options.icon;
  }
  
  // 自动提取链接并添加到 href（如果没有手动指定）
  if (!options.href) {
    const extractedHref = extractLinksForHref(processedContent);
    if (Object.keys(extractedHref).length > 0) {
      element.href = extractedHref;
    }
  } else {
    element.href = options.href;
  }
  
  return element;
}

/**
 * 构造飞书卡片 JSON
 * @param title 卡片标题
 * @param mdText 纯 Markdown 文本
 * @param options Markdown 处理选项
 */
function buildFeishuMarkdownCard(
  title: string, 
  mdText: string,
  options: MarkdownProcessOptions = {}
) {
  const markdownElement = buildMarkdownElement(mdText, {
    text_size: "normal",
    text_align: "left",
    icon: {
      tag: "standard_icon",
      token: "chat-forbidden_outlined",
      color: "orange",
    },
    ...options
  });

  return {
    msg_type: "interactive",
    card: {
      header: {
        template: "blue", // 卡片头部主题色
        title: {
          tag: "plain_text",
          content: title,
        },
      },
      elements: [markdownElement],
    },
  };
}

/**
 * 构建支持多语言的飞书卡片
 * @param title 卡片标题
 * @param mdText Markdown 文本
 * @param options 处理选项
 */
function buildI18nFeishuMarkdownCard(
  title: string,
  mdText: string,
  options: MarkdownProcessOptions = {}
) {
  const processedContent = processMarkdownContent(mdText, options);
  
  return {
    msg_type: "interactive",
    card: {
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: title,
        },
      },
      i18n_elements: {
        zh_cn: [
          buildMarkdownElement(processedContent, options)
        ],
        en_us: [
          buildMarkdownElement(processedContent, options)
        ]
      }
    },
  };
}

/**
 * 快速创建成功消息卡片
 * @param title 卡片标题
 * @param message 消息内容
 * @param options 额外选项
 */
function createSuccessCard(title: string, message: string, options: MarkdownProcessOptions = {}) {
  return buildFeishuMarkdownCard(title, message, {
    icon: FEISHU_ICONS.SUCCESS,
    ...options
  });
}

/**
 * 快速创建错误消息卡片
 * @param title 卡片标题
 * @param message 消息内容
 * @param options 额外选项
 */
function createErrorCard(title: string, message: string, options: MarkdownProcessOptions = {}) {
  return buildFeishuMarkdownCard(title, message, {
    icon: FEISHU_ICONS.ERROR,
    ...options
  });
}

/**
 * 快速创建警告消息卡片
 * @param title 卡片标题
 * @param message 消息内容
 * @param options 额外选项
 */
function createWarningCard(title: string, message: string, options: MarkdownProcessOptions = {}) {
  return buildFeishuMarkdownCard(title, message, {
    icon: FEISHU_ICONS.WARNING,
    ...options
  });
}

/**
 * 快速创建信息消息卡片
 * @param title 卡片标题
 * @param message 消息内容
 * @param options 额外选项
 */
function createInfoCard(title: string, message: string, options: MarkdownProcessOptions = {}) {
  return buildFeishuMarkdownCard(title, message, {
    icon: FEISHU_ICONS.INFO,
    ...options
  });
}

/**
 * 验证 Markdown 内容是否适合飞书卡片
 * @param content Markdown 内容
 * @returns 验证结果
 */
function validateMarkdownForFeishu(content: string): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // 检查内容长度
  if (content.length > 10000) {
    errors.push("内容长度超过 10000 字符，可能导致显示问题");
  }
  
  // 检查是否包含不支持的 HTML 标签
  const unsupportedTags = /<(script|style|iframe|form|input|button)[^>]*>/gi;
  if (unsupportedTags.test(content)) {
    warnings.push("内容包含不支持的 HTML 标签，将被忽略");
  }
  
  // 检查图片链接
  const imageLinks = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let imageMatch;
  while ((imageMatch = imageLinks.exec(content)) !== null) {
    const imageUrl = imageMatch[2];
    if (!imageUrl.startsWith('http')) {
      warnings.push(`图片链接 "${imageUrl}" 不是完整的 URL，可能无法显示`);
    }
  }
  
  // 检查表格（飞书卡片对表格支持有限）
  if (content.includes('|') && content.includes('---')) {
    warnings.push("检测到表格语法，飞书卡片对表格支持有限，建议使用列表代替");
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

function execTrim(cmd: string): string {
  try {
    return child.execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function sign_with_timestamp(timestamp: string, secret: string): string {
  const message = `${timestamp}\n${secret}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(message)
  return hmac.digest('base64')
}

function buildInteractiveCardPayload(card: unknown): string {
  return JSON.stringify({ msg_type: 'interactive', card })
}

/** 拉取 commit message（用 GitHub API） */
function fetchCommitMessageFromGitHub(owner: string, repo: string, sha: string, token: string): Promise<string> {
  return new Promise((resolve) => {
    if (!token || !owner || !repo || !sha) { resolve(''); return }
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/commits/${sha}`,
      method: 'GET',
      headers: {
        'User-Agent': 'node.js',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', c => data += c.toString())
      res.on('end', () => {
        try {
          const j = JSON.parse(data || '{}')
          resolve(j.commit?.message || '')
        } catch {
          resolve('')
        }
      })
    })
    req.on('error', () => resolve(''))
    req.end()
  })
}

async function postToFeishu(webhookId: string, body: string, tm?: string, sign?: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const qs = tm && sign ? `?timestamp=${tm}&sign=${encodeURIComponent(sign)}` : ''
    const options: https.RequestOptions = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: `/open-apis/bot/v2/hook/${webhookId}${qs}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8')
      }
    }

    const req = https.request(options, res => {
      let bodyResp = ''
      res.on('data', chunk => bodyResp += chunk.toString())
      res.on('end', () => {
        try {
          const parsed = JSON.parse(bodyResp || '{}')
          core.info(`Feishu response JSON: ${JSON.stringify(parsed)}`)
          if (parsed?.StatusCode != 0 ) {
            resolve(res.statusCode)
            return
          }
        } catch {
          core.info(`Feishu response text: ${bodyResp || '<empty>'}`)
        }
        resolve(res.statusCode)
      })
    })
    req.on('error', e => {
      core.error(`Feishu request error: ${e && (e.stack || e.message || e)}`)
      reject(e)
    })
    req.write(body)
    req.end()
  })
}

/* -----------------------
   Simplified template replacer (only exact-match replacement)
   ----------------------- */

function renderFeishuCard(template: any, values: Record<string, string>) {
  const card = JSON.parse(JSON.stringify(template)); // 深拷贝

  function replace(obj: any): any {
    if (typeof obj === 'string') {
      // 仅当字符串完全等于 values 的 key 时替换（向后兼容旧行为）
      if (values.hasOwnProperty(obj)) return values[obj]
      return obj
    }
    if (Array.isArray(obj)) return obj.map(replace)
    if (obj && typeof obj === 'object') {
      const newObj: any = {}
      for (const k of Object.keys(obj)) newObj[k] = replace(obj[k])
      return newObj
    }
    return obj
  }

  return replace(card)
}

/* -----------------------
   Main run (MSG_TEXT 原样发送；template fallback 使用 exact-match 替换)
   ----------------------- */

async function run(): Promise<void> {
  try {
    const webhook = core.getInput('FEISHU_BOT_WEBHOOK') || process.env.FEISHU_BOT_WEBHOOK || ''
    const signKey = core.getInput('FEISHU_BOT_SIGNKEY') || process.env.FEISHU_BOT_SIGNKEY || ''
    const dryInput = core.getInput('DRY_RUN') || process.env.DRY_RUN || ''
    const dry = dryInput === 'true' || dryInput === '1' || process.argv.includes('--dry')

    const msgTextInput = core.getInput('MSG_TEXT') || process.env.MSG_TEXT || ''
    /**
     * 
     * // ===== 使用示例 =====
     * const MSG_TEXT = `
     * **飞书卡片 Markdown 测试** 📧
     * 
     * ## 功能特性
     * - 支持 **加粗** / *斜体* / ~~删除线~~
     * - [GitHub 链接](https://github.com)
     * - \`行内代码\` 和代码块
     * - @all @username 用户提醒
     * - 😀 😃 😄 emoji 支持
     * 
     * ### 代码示例
     * \`\`\`javascript
     * console.log("Hello Feishu!");
     * \`\`\`
     * 
     * > 这是一个引用块
     * 
     * 1. 有序列表项 1
     * 2. 有序列表项 2
     * 
     * ---
     * 
     * 更多信息请访问：https://open.feishu.cn
     * `;
     * 
     * // 基础用法
     * const cardData = buildFeishuMarkdownCard("富文本消息测试！", MSG_TEXT);
     * 
     * // 高级用法 - 自定义选项
     * const advancedCard = buildFeishuMarkdownCard("高级消息", MSG_TEXT, {
     *   text_size: "heading",
     *   text_align: "center",
     *   icon: {
     *     tag: "standard_icon",
     *     token: "info_outlined",
     *     color: "blue"
     *   },
     *   enableAtParsing: true,
     *   enableEmojiParsing: true,
     *   enableLinkParsing: true
     * });
     * 
     * // 多语言支持
     * const i18nCard = buildI18nFeishuMarkdownCard("国际化消息", MSG_TEXT);
     * 
     * console.log(JSON.stringify(cardData, null, 2));
     * 
     */

    const payload = context.payload || {}
    core.debug(JSON.stringify(payload))

    // commit message & sha
    let commitMsg = payload.head_commit?.message || ''
    let sha = payload.head_commit?.id || process.env.GITHUB_SHA || ''
    if (!commitMsg && process.env.GITHUB_TOKEN && sha && payload.repository?.full_name) {
      const [owner, repo] = (payload.repository.full_name || '').split('/')
      commitMsg = await fetchCommitMessageFromGitHub(owner, repo, sha, process.env.GITHUB_TOKEN || '')
    }
    if (!commitMsg && !process.env.GITHUB_SHA) {
      commitMsg = execTrim(`git show -s --format=%s ${sha || 'HEAD'}`) || ''
    }

    // runtime variables
    const actor = payload.sender?.login || payload.repository?.owner?.login || process.env.GITHUB_ACTOR || execTrim('git config user.name') || 'unknown'
    const repoFull = payload.repository?.full_name || process.env.GITHUB_REPOSITORY || ''
    const repoName = payload.repository?.name || (repoFull.split('/')[1] || '')
    const ref = payload.ref || process.env.GITHUB_REF || ''
    const branch = typeof ref === 'string' && ref.includes('refs/heads/') ? ref.replace('refs/heads/', '') : (process.env.GITHUB_REF_NAME || 'main')
    const commitShort = (sha || '').slice(0, 16)
    const commitUrl = payload.compare || (sha && repoFull ? `https://github.com/${repoFull}/commit/${sha}` : '')
    const userUrl = payload.sender?.html_url || payload.repository?.owner?.html_url || (actor ? `https://github.com/${actor}` : '')
    const status = payload.action || 'ok'
    const workflow = process.env.GITHUB_WORKFLOW || 'workflow'
    const title = `Action ${repoName || workflow} OK`
    const runId = process.env.GITHUB_RUN_ID || ''
    const detailUrl = (repoFull && runId) ? `https://github.com/${repoFull}/actions/runs/${runId}` : (commitUrl || '')

    const defaultValues: Record<string,string|undefined> = {
      actor: actor,
      repo_full: repoFull,
      repo_name: repoName,
      branch_raw: branch,
      commit_short: commitShort,
      commit_raw: commitShort,
      commit_url_value: commitUrl,
      user_raw: actor,
      user_url_value: userUrl,
      status_raw: status,
      msg_raw: commitMsg || 'No commit message',
      title_raw: title,
      detail_url_value: detailUrl,
      workflow: workflow,
      run_id: runId,
    }

    // 仅使用程序内默认变量，不再支持 MSG_VARS
    const mergedValues = Object.fromEntries(Object.entries(defaultValues).map(([k,v]) => [k, v == null ? '' : String(v)])) as Record<string,string>

    if (!webhook && !dry) {
      core.setFailed('FEISHU_BOT_WEBHOOK is required for live send. For dry run set DRY_RUN=true or use --dry.')
      return
    }

    // 如果提供 MSG_TEXT，则使用增强的 Markdown 处理功能发送
    if (msgTextInput) {
      // 验证 Markdown 内容
      const validation = validateMarkdownForFeishu(msgTextInput);
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => core.warning(warning));
      }
      if (!validation.valid) {
        validation.errors.forEach(error => core.error(error));
        core.setFailed('Markdown 内容验证失败');
        return;
      }
      
      // 使用增强的 Markdown 处理功能
      const markdownOptions: MarkdownProcessOptions = {
        text_size: "normal",
        text_align: "left",
        enableAtParsing: true,
        enableEmojiParsing: true,
        enableLinkParsing: true
      };
      
      const processedContent = processMarkdownContent(msgTextInput, markdownOptions);
      
      const postCard = {
        i18n_elements: {
          zh_cn: [
            buildMarkdownElement(processedContent, markdownOptions)
          ],
          en_us: [
            buildMarkdownElement(processedContent, markdownOptions)
          ]
        }
      }

      if (dry) {
        core.info('DRY RUN: final markdown card JSON:')
        core.info(buildInteractiveCardPayload(postCard))
        return
      }

      const webhookId = webhook.includes('hook/') ? webhook.slice(webhook.indexOf('hook/') + 5) : webhook
      const tm = signKey ? Math.floor(Date.now() / 1000).toString() : undefined
      const sign = signKey && tm ? sign_with_timestamp(tm, signKey) : undefined
      const statusCode = await postToFeishu(webhookId, buildInteractiveCardPayload(postCard), tm, sign)
      core.info(`Sent markdown card to Feishu, HTTP status: ${statusCode}`)
      return
    }

    // 否则使用默认 template（只做 exact-match 替换）
    const template = {"i18n_elements":{"zh_cn":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**分支：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"branch_raw","tag":"plain_text"}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**ID：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"commit_raw","text_align":"left","href":{"commit_url":{"ios_url":"","pc_url":"","android_url":"","url":"commit_url_value"}}}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**用户：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"user_raw","href":{"user_url":{"ios_url":"","pc_url":"","android_url":"","url":"user_url_value"}}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**状态：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"status_raw","tag":"plain_text"}}]}]},{"tag":"markdown","content":"msg_raw"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"查看详情"},"type":"primary","multi_url":{"url":"detail_url_value","pc_url":"","android_url":"","ios_url":""}}]}],"en_us":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Branch：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"branch_raw","tag":"plain_text"}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Commit：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"commit_raw","text_align":"left","href":{"commit_url":{"ios_url":"","pc_url":"","android_url":"","url":"commit_url_value"}}}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**User：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"user_raw","href":{"user_url":{"ios_url":"","pc_url":"","android_url":"","url":"user_url_value"}}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Status：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"status_raw","tag":"plain_text"}}]}]},{"tag":"markdown","content":"msg_raw"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"Get info"},"type":"primary","multi_url":{"url":"detail_url_value","pc_url":"","android_url":"","ios_url":""}}]}]},"header":{"template":"blue","title":{"tag":"plain_text","i18n":{"zh_cn":"title_raw","en_us":"title_raw"}}}}

    const cardObj = renderFeishuCard(template, mergedValues)

    if (dry) {
      core.info('DRY RUN: final card JSON:')
      core.info(buildInteractiveCardPayload(cardObj))
      return
    }

    const webhookId = webhook.includes('hook/') ? webhook.slice(webhook.indexOf('hook/') + 5) : webhook
    const tm = signKey ? Math.floor(Date.now() / 1000).toString() : undefined
    const sign = signKey && tm ? sign_with_timestamp(tm, signKey) : undefined

    const statusCode = await postToFeishu(webhookId, buildInteractiveCardPayload(cardObj), tm, sign)
    core.info(`Sent card to Feishu, HTTP status: ${statusCode}`)
  } catch (error) {
    core.setFailed(`Action failed: ${error}`)
  }
}

run()
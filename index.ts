import * as core from '@actions/core'
import { context } from '@actions/github'
import * as https from 'https'
import * as crypto from 'crypto'
import * as child from 'child_process'

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

// Build Feishu payloads
function buildInteractiveCardPayload(card: unknown): string {
  return JSON.stringify({ msg_type: 'interactive', card })
}

function buildTextPayload(text: string): string {
  return JSON.stringify({ msg_type: 'text', content: { text } })
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

    const maskedWebhook = webhookId ? `${webhookId.slice(0, 6)}...${webhookId.slice(-6)}` : 'none'

    const req = https.request(options, res => {
      let bodyResp = ''
      res.on('data', chunk => bodyResp += chunk.toString())
      res.on('end', () => {

        // 尝试解析为 JSON 并打印友好信息
        let parsed: any = null
        try {
          parsed = JSON.parse(bodyResp || '{}')
          core.info(`Feishu response JSON: ${JSON.stringify(parsed)}`)
          if (parsed?.StatusCode != 0 ) {
            resolve(res.statusCode)
            return
          }
        } catch (e) {
          core.info(`Feishu response text: ${bodyResp || '<empty>'}`)
        }

        try { core.debug(`feishu resp: ${bodyResp}`) } catch { }
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

function renderFeishuCard(template: any, values: Record<string, string>) {
  const card = JSON.parse(JSON.stringify(template)); // 深拷贝

  function replace(obj: any): any {
    if (typeof obj === "string") {
      if (values.hasOwnProperty(obj)) {
        return values[obj];
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(replace);
    }
    if (obj && typeof obj === "object") {
      const newObj: any = {};
      for (const key in obj) {
        newObj[key] = replace(obj[key]);
      }
      return newObj;
    }
    return obj;
  }

  return replace(card);
}


async function run(): Promise<void> {
  try {
    const webhook = core.getInput('FEISHU_BOT_WEBHOOK') || process.env.FEISHU_BOT_WEBHOOK || ''
    const signKey = core.getInput('FEISHU_BOT_SIGNKEY') || process.env.FEISHU_BOT_SIGNKEY || ''
    const dryInput = core.getInput('DRY_RUN') || process.env.DRY_RUN || ''
    const dry = dryInput === 'true' || dryInput === '1' || process.argv.includes('--dry')
    const txtMsgInput = core.getInput('TXT_MSG') || process.env.TXT_MSG || ''

    if (!webhook && !dry) {
      core.setFailed('FEISHU_BOT_WEBHOOK is required for live send. For dry run set DRY_RUN=true or use --dry.')
      return
    }

    // payload & context
    const payload = context.payload || {}
    core.debug(JSON.stringify(payload))

    // Prefer head_commit from payload
    let commitMsg = payload.head_commit?.message || ''
    let sha = payload.head_commit?.id || process.env.GITHUB_SHA || ''
    // If no commit message, try GitHub API (requires GITHUB_TOKEN)
    if (!commitMsg && process.env.GITHUB_TOKEN && sha && payload.repository?.full_name) {
      const [owner, repo] = (payload.repository.full_name || '').split('/')
      commitMsg = await fetchCommitMessageFromGitHub(owner, repo, sha, process.env.GITHUB_TOKEN || '')
    }
    // Local git fallback when GITHUB_SHA not provided (for local testing)
    if (!commitMsg && !process.env.GITHUB_SHA) {
      commitMsg = execTrim(`git show -s --format=%s ${sha || 'HEAD'}`) || ''
    }

    // Fields: actor, repo, branch, commit short, urls...
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

    // If TXT_MSG provided, send as plain text message
    if (txtMsgInput) {
      const body = buildTextPayload(txtMsgInput)
      if (dry) {
        core.info('DRY RUN: final text message JSON:')
        core.info(body)
        return
      }
      const webhookId = webhook.includes('hook/') ? webhook.slice(webhook.indexOf('hook/') + 5) : webhook
      const tm = signKey ? Math.floor(Date.now() / 1000).toString() : undefined
      const sign = signKey && tm ? sign_with_timestamp(tm, signKey) : undefined
      const statusCode = await postToFeishu(webhookId, body, tm, sign)
      core.info(`Sent text to Feishu, HTTP status: ${statusCode}`)
      return
    }

    const template = {"i18n_elements":{"zh_cn":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**分支：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"branch_raw","tag":"plain_text"}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**ID：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"commit_raw","text_align":"left","href":{"commit_url":{"ios_url":"","pc_url":"","android_url":"","url":"commit_url_value"}}}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**用户：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"user_raw","href":{"user_url":{"ios_url":"","pc_url":"","android_url":"","url":"user_url_value"}}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**状态：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"status_raw","tag":"plain_text"}}]}]},{"tag":"markdown","content":"msg_raw"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"查看详情"},"type":"primary","multi_url":{"url":"detail_url_value","pc_url":"","android_url":"","ios_url":""}}]}],"en_us":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Branch：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"branch_raw","tag":"plain_text"}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Commit：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"commit_raw","text_align":"left","href":{"commit_url":{"ios_url":"","pc_url":"","android_url":"","url":"commit_url_value"}}}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**User：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"user_raw","href":{"user_url":{"ios_url":"","pc_url":"","android_url":"","url":"user_url_value"}}}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Status：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"div","text":{"content":"status_raw","tag":"plain_text"}}]}]},{"tag":"markdown","content":"msg_raw"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"Get info"},"type":"primary","multi_url":{"url":"detail_url_value","pc_url":"","android_url":"","ios_url":""}}]}]},"header":{"template":"blue","title":{"tag":"plain_text","i18n":{"zh_cn":"title_raw","en_us":"title_raw"}}}}

    const msg = commitMsg || 'No commit message'

    const values = {
      branch_raw: branch,
      commit_raw: commitShort,
      commit_url_value: commitUrl,
      user_raw: actor,
      user_url_value: userUrl,
      status_raw: status,
      msg_raw: msg,
      title_raw: title,
      detail_url_value: detailUrl,
    };
    
    const cardObj = renderFeishuCard(template, values);

    if (dry) {
      core.info('DRY RUN: final card JSON:')
      core.info(buildInteractiveCardPayload(cardObj))
      return
    }

    // live send
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

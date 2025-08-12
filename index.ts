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

export function sign_with_timestamp(timestamp: number, secret: string): string {
  const message = `${timestamp}\n${secret}`
  return crypto.createHmac('SHA256', secret).update(message).digest('base64')
}

export function buildInteractiveCardPayload(card: unknown): string {
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

export async function postToFeishu(webhookId: string, body: string, tm?: number, sign?: string): Promise<number | undefined> {
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

          // 兼容两种返回：{StatusCode:0} 或 {code:0}
          const statusCodeField = typeof parsed?.StatusCode === 'number' ? parsed.StatusCode : undefined
          const codeField = typeof parsed?.code === 'number' ? parsed.code : undefined
          if (statusCodeField !== undefined && statusCodeField !== 0) {
            resolve(res.statusCode)
            return
          }
          if (codeField !== undefined && codeField !== 0) {
            if (codeField === 19021) {
              core.warning('飞书验签失败（19021）：签名不匹配或时间戳与服务器相差超过 1 小时。请检查 FEISHU_BOT_SIGNKEY、时间戳与服务器时间。')
            }
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

export function renderFeishuCard(template: any, values: Record<string, string>) {
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
   Main run (MSG_TEXT 使用简化的 json 格式)
   ----------------------- */

async function run(): Promise<void> {
  try {
    const webhook = (core.getInput('FEISHU_BOT_WEBHOOK') || process.env.FEISHU_BOT_WEBHOOK || '').trim()
    const signKey = (core.getInput('FEISHU_BOT_SIGNKEY') || process.env.FEISHU_BOT_SIGNKEY || '').trim()
    const dryInput = core.getInput('DRY_RUN') || process.env.DRY_RUN || ''
    const dry = dryInput === 'true' || dryInput === '1' || process.argv.includes('--dry')

    const msgTextInput = core.getInput('MSG_TEXT') || process.env.MSG_TEXT || ''

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

    // 如果提供 MSG_TEXT，则使用新的简化 json 格式
    if (msgTextInput) {
      const postCard = {
        elements: [
          {
            tag: "markdown",
            content: msgTextInput
          }
        ]
      }

      if (dry) {
        core.info('DRY RUN: final markdown card JSON:')
        core.info(buildInteractiveCardPayload(postCard))
        return
      }

      const webhookId = webhook.includes('hook/') ? webhook.slice(webhook.indexOf('hook/') + 5) : webhook
      const tm = signKey ? Math.floor(Date.now() / 1000) : undefined
      const sign = signKey && tm ? sign_with_timestamp(tm, signKey) : undefined

      if (tm) {
        const nowSec = Math.floor(Date.now() / 1000)
        const drift = Number(tm) - nowSec
        core.info(`Feishu signing timestamp: ${tm} (${new Date(Number(tm) * 1000).toISOString()}), drift(s)=${drift}`)
        if (Math.abs(drift) > 3700) {
          core.warning('时间戳与当前时间相差超过 1 小时，飞书将拒绝请求。请检查 Runner 系统时间。')
        }
      }

      const statusCode = await postToFeishu(webhookId, buildInteractiveCardPayload(postCard), tm, sign)
      core.info(`Sent markdown card to Feishu, HTTP status: ${statusCode}`)
      return
    }

    // 否则使用默认 template（只做 exact-match 替换）
    const template = {"i18n_elements":{"zh_cn":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**分支：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"BRANCH_RAW"}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**ID：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"[COMMIT_RAW](COMMIT__URL)","text_align":"left"}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**用户：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"[USER_RAW](USER__URL)"}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**状态：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**<font color='green'>STATUS_RAW</font>**"}]}]},{"tag":"markdown","content":"MSG_RAW"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"查看详情"},"type":"primary","multi_url":{"url":"DETAIL_URL","pc_url":"","android_url":"","ios_url":""}}]}],"en_us":[{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Branch：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"BRANCH_RAW"}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Commit：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"[COMMIT_RAW](COMMIT__URL)","text_align":"left"}]}]},{"tag":"column_set","flex_mode":"none","background_style":"default","columns":[{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**User：**"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"[USER_RAW](USER__URL)"}]},{"tag":"column","width":"auto","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**Status：**","text_align":"left"}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**<font color='green'>STATUS_RAW</font>**"}]}]},{"tag":"markdown","content":"MSG_RAW"},{"tag":"hr"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"Get info"},"type":"primary","multi_url":{"url":"DETAIL_URL","pc_url":"","android_url":"","ios_url":""}}]}]},"header":{"template":"blue","title":{"tag":"plain_text","i18n":{"zh_cn":"TITLE_RAW","en_us":"TITLE_RAW"}}}}

    const cardObj = renderFeishuCard(template, mergedValues)

    if (dry) {
      core.info('DRY RUN: final card JSON:')
      core.info(buildInteractiveCardPayload(cardObj))
      return
    }

    const webhookId = webhook.includes('hook/') ? webhook.slice(webhook.indexOf('hook/') + 5) : webhook
    const tm = signKey ? Math.floor(Date.now() / 1000) : undefined
    const sign = signKey && tm ? sign_with_timestamp(tm, signKey) : undefined

    if (tm) {
      const nowSec = Math.floor(Date.now() / 1000)
      const drift = Number(tm) - nowSec
      core.info(`Feishu signing timestamp: ${tm} (${new Date(Number(tm) * 1000).toISOString()}), drift(s)=${drift}`)
      if (Math.abs(drift) > 3700) {
        core.warning('时间戳与当前时间相差超过 1 小时，飞书将拒绝请求。请检查 Runner 系统时间。')
      }
    }

    const statusCode = await postToFeishu(webhookId, buildInteractiveCardPayload(cardObj), tm, sign)
    core.info(`Sent card to Feishu, HTTP status: ${statusCode}`)
  } catch (error) {
    core.setFailed(`Action failed: ${error}`)
  }
}

run()
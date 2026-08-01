import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const executablePath = candidates.find(existsSync)
const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:4173'
const mockModels = ['model-primary', 'model-secondary', 'model-slow', 'model-unavailable']

if (!executablePath) throw new Error('Chrome or Edge is required for UI verification.')

async function installMockApi(page) {
  await page.route('**/api/models', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: mockModels.map((id) => ({ id })) }),
  }))
  await page.route('**/api/chat', async (route) => {
    const request = route.request()
    const body = request.postDataJSON()
    const prompt = body.messages?.find((message) => message.role === 'user')?.content || ''
    const publicRound = prompt.includes('此前完整会议记录')
    if (body.model === 'model-unavailable') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'model_not_found', message: 'The model does not exist.' } }),
      })
      return
    }
    if (publicRound && body.model === 'model-slow') await new Promise((resolve) => setTimeout(resolve, 650))
    const content = publicRound
      ? `已收到主持人的补充。${body.model} 会审阅其他席位的观点，并说明本席立场是否变化。`
      : '初步立场：建议先做受控试点。关键依据：范围可控、风险可回滚。希望主持人补充成功标准。'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    })
  })
}

const browser = await chromium.launch({ executablePath, headless: true })
const errors = []

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await installMockApi(desktop)
  desktop.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('status of 404')) errors.push(message.text())
  })
  desktop.on('pageerror', (error) => errors.push(error.message))
  desktop.on('response', async (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/chat')) errors.push(`HTTP ${response.status()} ${response.url()} ${await response.text()}`)
  })

  await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
  await desktop.getByRole('heading', { name: '发起讨论' }).waitFor()
  await desktop.screenshot({ path: 'C:\\Users\\Sheldon\\AppData\\Local\\Temp\\opencode\\ai-meeting-desktop.png', fullPage: true })
  await desktop.waitForFunction(() => !document.querySelector('.primary-action')?.disabled)
  const strategistModel = desktop.getByLabel('配置方案提出者使用的模型')
  const modelOptions = await strategistModel.locator('option').evaluateAll((options) => options.map((option) => option.value))
  if (modelOptions.length < 2) throw new Error('Role model persistence check requires at least two available models.')
  const initialStrategistModel = await strategistModel.inputValue()
  const persistedStrategistModel = modelOptions.find((model) => model !== initialStrategistModel)
  await strategistModel.selectOption(persistedStrategistModel)
  await desktop.reload({ waitUntil: 'networkidle' })
  await desktop.waitForFunction(() => !document.querySelector('.primary-action')?.disabled)
  if (await desktop.getByLabel('配置方案提出者使用的模型').inputValue() !== persistedStrategistModel) {
    throw new Error('The last role model selection was not restored after reload.')
  }
  await desktop.getByLabel('配置方案提出者使用的模型').selectOption(initialStrategistModel)
  await desktop.getByLabel('配置反方辩手使用的模型').selectOption('model-unavailable')
  await desktop.getByRole('button', { name: /开始会议/ }).click()
  await desktop.locator('.meeting-screen').waitFor()
  await desktop.getByText('模型不可用', { exact: true }).waitFor()
  await desktop.getByLabel('修改反方辩手使用的模型').selectOption(initialStrategistModel)
  await desktop.getByRole('button', { name: '重试反方辩手' }).click()
  await desktop.locator('.table-member').filter({ hasText: '反方辩手' }).getByText('已完成', { exact: true }).waitFor()
  await desktop.getByLabel('修改风险审查员使用的模型').selectOption('model-slow')
  await desktop.getByPlaceholder('补充事实、质疑假设，或点名请某个议事席展开……').fill('我最担心的是试点期间的错误回答会直接影响客户信任，请先明确人工接管的触发条件。')
  await desktop.getByRole('button', { name: '发送发言' }).click()
  await desktop.waitForTimeout(100)
  if (await desktop.getByText('公开质询', { exact: true }).count() !== 0) throw new Error('A partial response was published before the slow seat finished.')
  await desktop.getByText('公开质询', { exact: true }).first().waitFor({ timeout: 120000 })
  await desktop.getByRole('button', { name: /形成阶段纪要/ }).click()
  await desktop.getByText('阶段会议纪要', { exact: true }).waitFor({ timeout: 120000 })
  await desktop.waitForFunction(() => getComputedStyle(document.querySelector('.summary-page')).opacity === '1')
  await desktop.screenshot({ path: 'C:\\Users\\Sheldon\\AppData\\Local\\Temp\\opencode\\ai-meeting-result.png', fullPage: true })
  await desktop.getByRole('button', { name: /会议档案/ }).click()
  await desktop.getByRole('heading', { name: '会议档案' }).waitFor()
  await desktop.getByRole('button', { name: /打开会议：我们是否应该把 AI 客服接入现有售后流程/ }).waitFor()
  await desktop.reload({ waitUntil: 'networkidle' })
  await desktop.getByRole('button', { name: /会议档案/ }).click()
  await desktop.getByRole('button', { name: /打开会议：我们是否应该把 AI 客服接入现有售后流程/ }).click()
  await desktop.getByText('阶段会议纪要', { exact: true }).waitFor()

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await installMockApi(mobile)
  mobile.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('status of 404')) errors.push(message.text())
  })
  mobile.on('response', async (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/chat')) errors.push(`HTTP ${response.status()} ${response.url()} ${await response.text()}`)
  })
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: 'C:\\Users\\Sheldon\\AppData\\Local\\Temp\\opencode\\ai-meeting-mobile.png', fullPage: true })
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (overflow) throw new Error('Mobile layout has horizontal overflow.')
  await mobile.getByRole('button', { name: '打开导航' }).click()
  await mobile.getByRole('button', { name: /会议档案/ }).click()
  await mobile.getByRole('heading', { name: '会议档案' }).waitFor()

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
  console.log('UI verification passed: role model preferences, desktop flow, local archive persistence, and mobile layout.')
} finally {
  await browser.close()
}

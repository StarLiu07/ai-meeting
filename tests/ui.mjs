import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const executablePath = candidates.find(existsSync)
const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:4173'

if (!executablePath) throw new Error('Chrome or Edge is required for UI verification.')

const browser = await chromium.launch({ executablePath, headless: true })
const errors = []

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  desktop.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  desktop.on('pageerror', (error) => errors.push(error.message))
  desktop.on('response', async (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()} ${await response.text()}`)
  })

  await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
  await desktop.getByRole('heading', { name: '发起讨论' }).waitFor()
  await desktop.screenshot({ path: 'C:\\Users\\Sheldon\\AppData\\Local\\Temp\\opencode\\ai-meeting-desktop.png', fullPage: true })
  await desktop.waitForFunction(() => !document.querySelector('.primary-action')?.disabled)
  await desktop.getByRole('button', { name: /开始会议/ }).click()
  await desktop.locator('.meeting-screen').waitFor()
  await desktop.getByPlaceholder('补充事实、质疑假设，或点名请某个议事席展开……').fill('我最担心的是试点期间的错误回答会直接影响客户信任，请先明确人工接管的触发条件。')
  await desktop.getByRole('button', { name: '发送发言' }).click()
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
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  mobile.on('response', async (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()} ${await response.text()}`)
  })
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: 'C:\\Users\\Sheldon\\AppData\\Local\\Temp\\opencode\\ai-meeting-mobile.png', fullPage: true })
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (overflow) throw new Error('Mobile layout has horizontal overflow.')
  await mobile.getByRole('button', { name: '打开导航' }).click()
  await mobile.getByRole('button', { name: /会议档案/ }).click()
  await mobile.getByRole('heading', { name: '会议档案' }).waitFor()

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
  console.log('UI verification passed: desktop flow, local archive persistence, and mobile layout.')
} finally {
  await browser.close()
}

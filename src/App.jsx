import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  History,
  LayoutDashboard,
  Lightbulb,
  Menu,
  MessageSquareWarning,
  Plus,
  RotateCw,
  Scale,
  SearchCheck,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wrench,
  X,
  LoaderCircle,
} from 'lucide-react'

const roles = [
  {
    id: 'strategist',
    name: '方案提出者',
    model: 'Atlas',
    modelId: 'claude-sonnet-5',
    description: '提出可落地路径与取舍',
    color: '#2457d6',
    icon: Lightbulb,
  },
  {
    id: 'critic',
    name: '反方辩手',
    model: 'Sage',
    modelId: 'deepseek-v4-pro',
    description: '挑战前提与乐观假设',
    color: '#e4582c',
    icon: MessageSquareWarning,
  },
  {
    id: 'risk',
    name: '风险审查员',
    model: 'Nova',
    modelId: 'claude-opus-5',
    description: '识别失败模式与边界',
    color: '#8b3fb0',
    icon: ShieldAlert,
  },
  {
    id: 'fact',
    name: '事实核查员',
    model: 'Verity',
    modelId: 'claude-fable-5',
    description: '区分事实、推断和缺口',
    color: '#06856b',
    icon: SearchCheck,
  },
  {
    id: 'user',
    name: '用户利益代表',
    model: 'Echo',
    modelId: 'gpt-5.6-sol',
    description: '检验真实价值与使用成本',
    color: '#b57708',
    icon: Users,
  },
]

const phases = [
  { label: '独立分析', detail: '首轮互不可见', icon: Bot },
  { label: '交叉质询', detail: '公开观点并相互审阅', icon: MessageSquareWarning },
  { label: '立场修订', detail: '记录观点变化', icon: History },
  { label: '主持决议', detail: '汇总共识与分歧', icon: Scale },
]

const initialForm = {
  topic: '我们是否应该把 AI 客服接入现有售后流程？',
  goal: '在不降低客户满意度的前提下，减少一线客服的重复工作量。',
  context: '团队每月约处理 8,000 个售后咨询，其中 62% 是物流、退换货规则等重复问题。当前有 12 名客服，没有专职 AI 工程师。',
  constraints: '两个月内验证；首期预算不超过 10 万元；涉及退款的操作必须由人工确认。',
}

const initialApiConfig = {
  baseUrl: '',
  apiKey: '',
}

const meetingsStorageKey = 'ai-meeting-records-v1'
const roleModelsStorageKey = 'ai-meeting-role-models-v1'
const modelRequestTimeoutMs = 45000

class ModelRequestError extends Error {
  constructor(message, kind = 'error') {
    super(message)
    this.name = 'ModelRequestError'
    this.kind = kind
  }
}

function getRoleStatusMeta(status = 'idle') {
  const metadata = {
    idle: { label: '等待下一轮', className: 'idle', Icon: Clock3, retryable: false },
    pending: { label: '正在生成', className: 'pending', Icon: LoaderCircle, retryable: false },
    success: { label: '已完成', className: 'success', Icon: CheckCircle2, retryable: false },
    error: { label: '请求失败，可单独重试', className: 'error', Icon: AlertTriangle, retryable: true },
    timeout: { label: '超时，可单独重试', className: 'timeout', Icon: Clock3, retryable: true },
    unavailable: { label: '模型不可用', className: 'unavailable', Icon: ShieldAlert, retryable: true },
  }
  return metadata[status] || metadata.error
}

function classifyModelError(error) {
  if (error instanceof ModelRequestError) return error.kind
  return 'error'
}

function createRoleStatuses(activeRoles, roundId, status = 'idle') {
  return Object.fromEntries(activeRoles.map((role) => [role.id, {
    status,
    roundId,
    model: role.modelId,
  }]))
}

function getRestoredRoleStatuses(meeting, activeRoles) {
  const savedStatuses = meeting.roleStatuses && typeof meeting.roleStatuses === 'object' ? meeting.roleStatuses : {}
  const messages = Array.isArray(meeting.messages) ? meeting.messages : []
  return Object.fromEntries(activeRoles.map((role) => {
    const saved = savedStatuses[role.id]
    if (saved) {
      return [role.id, saved.status === 'pending'
        ? { ...saved, status: 'error', error: '上次请求未完成，请重试。' }
        : saved]
    }
    return [role.id, {
      status: messages.some((message) => message.roleId === role.id) ? 'success' : 'idle',
      roundId: 'restored',
      model: role.modelId,
    }]
  }))
}

function loadSavedRoleModels() {
  try {
    const saved = JSON.parse(localStorage.getItem(roleModelsStorageKey) || '{}')
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') return {}
    return Object.fromEntries(roles
      .filter((role) => typeof saved[role.id] === 'string' && saved[role.id])
      .map((role) => [role.id, saved[role.id]]))
  } catch {
    return {}
  }
}

function saveRoleModels(roleModels) {
  try {
    localStorage.setItem(roleModelsStorageKey, JSON.stringify(roleModels))
  } catch (error) {
    console.error('无法在本地保存角色模型偏好', error)
  }
}

function loadSavedMeetings() {
  try {
    const saved = JSON.parse(localStorage.getItem(meetingsStorageKey) || '[]')
    return Array.isArray(saved) ? saved.filter((meeting) => meeting?.id && meeting?.form?.topic) : []
  } catch {
    return []
  }
}

function createMeetingId() {
  return globalThis.crypto?.randomUUID?.() || `meeting-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatMeetingDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

function Logo() {
  return (
    <div className="brand" aria-label="圆桌">
      <span className="brand-mark"><span /></span>
      <span className="brand-name">圆桌</span>
      <span className="brand-beta">BETA</span>
    </div>
  )
}

function getApiHeaders(apiConfig) {
  const headers = { 'Content-Type': 'application/json' }
  if (apiConfig.baseUrl) headers['x-api-base-url'] = apiConfig.baseUrl
  if (apiConfig.apiKey) headers['x-api-key'] = apiConfig.apiKey
  return headers
}

async function requestModel(model, system, prompt, apiConfig = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, modelRequestTimeoutMs)

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: getApiHeaders(apiConfig),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    })
    const raw = await response.text()
    let payload = {}
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      if (!response.ok) throw new ModelRequestError(`模型服务返回了无法识别的错误（HTTP ${response.status}）。`)
      throw new ModelRequestError('模型服务返回了无法识别的结果。')
    }
    if (!response.ok) {
      const message = payload.error?.message || payload.error || `模型请求失败（HTTP ${response.status}）`
      const messageText = String(message)
      const unavailable = response.status === 404
        || /model[^\n]*(not found|does not exist|unavailable)|模型[^\n]*(不存在|不可用)/i.test(messageText)
      throw new ModelRequestError(messageText, unavailable ? 'unavailable' : 'error')
    }
    const content = payload.choices?.[0]?.message?.content
    return typeof content === 'string' && content.trim() ? content.trim() : '这个议事席暂时没有提交内容。'
  } catch (error) {
    if (timedOut || error.name === 'AbortError') {
      throw new ModelRequestError(`模型响应超过 ${Math.round(modelRequestTimeoutMs / 1000)} 秒，已停止等待。`, 'timeout')
    }
    if (error instanceof ModelRequestError) throw error
    throw new ModelRequestError(`模型服务连接失败：${error.message}`)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function transcriptText(messages) {
  return messages.map((message) => `${message.author}: ${message.content}`).join('\n\n')
}

function MarkdownContent({ children, className = '' }) {
  return (
    <div className={`markdown-content ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}

async function askRole(role, system, prompt, apiConfig = {}) {
  return requestModel(role.modelId, system, prompt, apiConfig)
}

function SettingsModal({ config, onSave, onClose, onTest, testStatus }) {
  const [draft, setDraft] = useState({ ...config })

  function handleSave() {
    onSave({ ...draft })
  }

  function handleTest() {
    onTest({ ...draft })
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2><Settings size={18} /> API 提供商设置</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
        <p className="settings-desc">
          在这里配置你自己的 API 提供商。留空则使用服务器默认配置（.env.local）。
        </p>
        <div className="settings-body">
          <label className="settings-field">
            <span>API Base URL</span>
            <input
              type="text"
              value={draft.baseUrl}
              onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
            <small>例如 https://api.openai.com/v1，必须兼容 OpenAI Chat Completions 接口</small>
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
              placeholder="sk-..."
              autoComplete="off"
            />
            <small>密钥仅保存在浏览器本地，不会上传到服务器</small>
          </label>
          {testStatus && (
            <div className={`settings-status ${testStatus.ok ? 'settings-status-ok' : 'settings-status-err'}`}>
              {testStatus.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{testStatus.message}</span>
            </div>
          )}
        </div>
        <div className="settings-actions">
          <button className="settings-btn secondary" onClick={onClose}>取消</button>
          <button className="settings-btn secondary" onClick={handleTest} disabled={!draft.baseUrl && !draft.apiKey}>
            测试连接
          </button>
          <button className="settings-btn primary" onClick={handleSave}>保存配置</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [view, setView] = useState('setup')
  const [form, setForm] = useState(initialForm)
  const [selected, setSelected] = useState(roles.slice(0, 4).map((role) => role.id))
  const [mobileNav, setMobileNav] = useState(false)
  const [models, setModels] = useState([])
  const [apiStatus, setApiStatus] = useState('loading')
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [meetingError, setMeetingError] = useState('')
  const [summary, setSummary] = useState('')
  const [apiConfig, setApiConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('ai-meeting-api-config')
      return saved ? JSON.parse(saved) : { ...initialApiConfig }
    } catch {
      return { ...initialApiConfig }
    }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [roleModels, setRoleModels] = useState(loadSavedRoleModels)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [testStatus, setTestStatus] = useState(null)
  const [savedMeetings, setSavedMeetings] = useState(loadSavedMeetings)
  const [currentMeetingId, setCurrentMeetingId] = useState(null)
  const [roleStatuses, setRoleStatuses] = useState({})
  const currentMeetingRef = useRef(null)
  const activeRunRef = useRef(null)
  const lastBatchRef = useRef(null)

  useEffect(() => {
    currentMeetingRef.current = currentMeetingId
  }, [currentMeetingId])

  const selectedRoles = roles.filter((role) => selected.includes(role.id))

  const activeRoles = selectedRoles.map((role) => ({
    ...role,
    modelId: roleModels[role.id] || models[0] || role.modelId,
  }))

  function isCurrentRun(meetingId, roundId) {
    return currentMeetingRef.current === meetingId
      && activeRunRef.current?.meetingId === meetingId
      && activeRunRef.current?.roundId === roundId
  }

  function updateRoleStatusForRun(meetingId, roundId, roleId, patch) {
    if (!isCurrentRun(meetingId, roundId)) return
    setRoleStatuses((current) => ({
      ...current,
      [roleId]: { ...current[roleId], ...patch, roundId },
    }))
  }

  function createRoleMessage(batch, role, content) {
    return {
      type: 'ai',
      stage: batch.stage,
      roundId: batch.roundId,
      roleId: role.id,
      author: role.name,
      model: role.modelId,
      content,
    }
  }

  async function runRoleBatch(batch) {
    const settled = await Promise.allSettled(batch.roles.map((role) => (
      askRole(role, batch.system(role), batch.prompt, apiConfig)
        .then((content) => {
          updateRoleStatusForRun(batch.meetingId, batch.roundId, role.id, {
            status: 'success',
            model: role.modelId,
            error: '',
          })
          return { role, content }
        })
        .catch((error) => {
          updateRoleStatusForRun(batch.meetingId, batch.roundId, role.id, {
            status: classifyModelError(error),
            model: role.modelId,
            error: error.message,
          })
          throw error
        })
    )))

    const statuses = createRoleStatuses(batch.roles, batch.roundId)
    const messages = []
    settled.forEach((result, index) => {
      const role = batch.roles[index]
      if (result.status === 'fulfilled') {
        statuses[role.id] = {
          status: 'success',
          roundId: batch.roundId,
          model: role.modelId,
          error: '',
        }
        messages.push(createRoleMessage(batch, role, result.value.content))
      } else {
        statuses[role.id] = {
          status: classifyModelError(result.reason),
          roundId: batch.roundId,
          model: role.modelId,
          error: result.reason?.message || '模型没有返回结果',
        }
      }
    })
    return { messages, statuses }
  }

  function defaultAssignModels(availableModels, currentSelected, currentRoleModels) {
    if (!availableModels.length) return currentRoleModels
    const next = { ...currentRoleModels }
    for (const roleId of currentSelected) {
      if (!next[roleId] || !availableModels.includes(next[roleId])) {
        next[roleId] = availableModels[0]
      }
    }
    return next
  }

  function fetchModels(config = apiConfig) {
    const headers = {}
    if (config.baseUrl) headers['x-api-base-url'] = config.baseUrl
    if (config.apiKey) headers['x-api-key'] = config.apiKey

    setApiStatus('loading')
    fetch('/api/models', { headers })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || '无法连接模型服务')
        return payload.data || []
      })
      .then((items) => {
        const ids = items.map((item) => item.id)
        setModels(ids)
        setRoleModels((prev) => {
          const next = defaultAssignModels(ids, selected, prev)
          saveRoleModels(next)
          return next
        })
        setApiStatus('ready')
        setMeetingError('')
      })
      .catch((error) => {
        setApiStatus('error')
        setMeetingError(error.message)
      })
  }

  useEffect(() => {
    fetchModels(apiConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConfig, refreshTrigger])

  useEffect(() => {
    if (!currentMeetingId) return

    setSavedMeetings((current) => {
      const existing = current.find((meeting) => meeting.id === currentMeetingId)
      const now = new Date().toISOString()
      const record = {
        id: currentMeetingId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        form: { ...form },
        selected: [...selected],
        roleModels: { ...roleModels },
        messages: [...messages],
        roleStatuses: { ...roleStatuses },
        summary,
      }
      const next = [record, ...current.filter((meeting) => meeting.id !== currentMeetingId)]
      try {
        localStorage.setItem(meetingsStorageKey, JSON.stringify(next))
      } catch (error) {
        console.error('无法在本地保存会议记录', error)
      }
      return next
    })
  }, [currentMeetingId, form, messages, roleModels, roleStatuses, selected, summary, view])

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function toggleRole(id) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length > 3 ? current.filter((item) => item !== id) : current
      }
      return current.length < 5 ? [...current, id] : current
    })
    setRoleModels((prev) => {
      if ((!prev[id] || !models.includes(prev[id])) && models.length > 0) {
        const next = { ...prev, [id]: models[0] }
        saveRoleModels(next)
        return next
      }
      return prev
    })
  }

  function updateRoleModel(roleId, modelId) {
    setRoleModels((prev) => {
      const next = { ...prev, [roleId]: modelId }
      saveRoleModels(next)
      return next
    })
  }

  async function startMeeting(event) {
    event.preventDefault()
    if (!form.topic.trim()) return
    const meetingId = createMeetingId()
    const roundId = createMeetingId()
    const openingPrompt = `会议议题：${form.topic}\n决策目标：${form.goal}\n必要背景：${form.context}\n限制条件：${form.constraints}\n\n请先独立分析这个议题，不要假装已经看过其他参与者的意见。给出你的初步立场、两条关键依据，并提出一个你希望会议主持人（用户）回答的问题。控制在 250 字以内。`
    const batch = {
      meetingId,
      roundId,
      stage: 'opening',
      roles: activeRoles.map((role) => ({ ...role })),
      prompt: openingPrompt,
      system: (role) => `你是 AI 会议中的"${role.name}"。你的职责是${role.description}。你必须清楚区分事实、推测和价值判断，不要替用户做最终决定。`,
    }
    setMessages([])
    setSummary('')
    setCurrentMeetingId(meetingId)
    currentMeetingRef.current = meetingId
    activeRunRef.current = batch
    lastBatchRef.current = batch
    setRoleStatuses(createRoleStatuses(batch.roles, roundId, 'pending'))
    setMeetingError('')
    setView('meeting')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setIsThinking(true)
    try {
      const { messages: opening, statuses } = await runRoleBatch(batch)
      if (isCurrentRun(meetingId, roundId)) {
        setRoleStatuses(statuses)
        setMessages(opening)
      } else {
        appendMeetingMessages(meetingId, opening, statuses)
      }
    } catch (error) {
      if (isCurrentRun(meetingId, roundId)) setMeetingError(error.message)
    } finally {
      if (isCurrentRun(meetingId, roundId)) setIsThinking(false)
    }
  }

  function openSavedMeeting(meeting) {
    const nextForm = { ...initialForm, ...meeting.form }
    const nextSelected = meeting.selected?.filter((id) => roles.some((role) => role.id === id)) || roles.slice(0, 4).map((role) => role.id)
    const meetingRoles = roles
      .filter((role) => nextSelected.includes(role.id))
      .map((role) => ({ ...role, modelId: meeting.roleModels?.[role.id] || models[0] || role.modelId }))
    const restoredStatuses = getRestoredRoleStatuses(meeting, meetingRoles)
    const restoredMessages = Array.isArray(meeting.messages) ? meeting.messages : []
    const lastUserIndex = restoredMessages.findLastIndex((message) => message.type === 'user')
    const retryable = meetingRoles.some((role) => getRoleStatusMeta(restoredStatuses[role.id]?.status).retryable)

    setForm(nextForm)
    setSelected(nextSelected)
    setRoleModels(meeting.roleModels || {})
    setMessages(restoredMessages)
    setRoleStatuses(restoredStatuses)
    setSummary(meeting.summary || '')
    setMeetingError('')
    setIsThinking(false)
    setCurrentMeetingId(meeting.id)
    currentMeetingRef.current = meeting.id
    activeRunRef.current = null
    lastBatchRef.current = null
    if (retryable && !meeting.summary) {
      const stage = lastUserIndex >= 0 ? 'cross-examination' : 'opening'
      const roundId = restoredMessages[lastUserIndex]?.roundId
        || Object.values(restoredStatuses).find((status) => getRoleStatusMeta(status?.status).retryable)?.roundId
        || createMeetingId()
      const prompt = stage === 'opening'
        ? `会议议题：${nextForm.topic}\n决策目标：${nextForm.goal}\n必要背景：${nextForm.context}\n限制条件：${nextForm.constraints}\n\n请先独立分析这个议题，不要假装已经看过其他参与者的意见。给出你的初步立场、两条关键依据，并提出一个你希望会议主持人（用户）回答的问题。控制在 250 字以内。`
        : `原始议题：${nextForm.topic}\n此前完整会议记录：\n${transcriptText(restoredMessages.slice(0, lastUserIndex + 1))}`
      lastBatchRef.current = {
        meetingId: meeting.id,
        roundId,
        stage,
        roles: meetingRoles,
        prompt,
        system: (role) => stage === 'opening'
          ? `你是 AI 会议中的"${role.name}"。你的职责是${role.description}。你必须清楚区分事实、推测和价值判断，不要替用户做最终决定。`
          : `你是 AI 会议中的"${role.name}"，职责是${role.description}。独立开场已经锁定，现在进入公开交叉质询：你能看到此前的完整会议记录，但看不到其他席位正在生成的本轮回答。请同时完成三件事：1. 直接回应主持人刚才的发言；2. 点名审阅至少一个其他议事席的具体观点，说明你支持、质疑或补充什么以及理由；3. 说明你的初始立场是否改变及原因。不要机械赞同，也不要为了反对而反对；不要替主持人下结论。控制在 300 字以内。`,
      }
    }
    setView(meeting.summary ? 'result' : 'meeting')
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resumeMeeting() {
    const meeting = savedMeetings.find((item) => item.id === currentMeetingId)
    if (meeting) openSavedMeeting(meeting)
  }

  function appendMeetingMessages(meetingId, addedMessages, statuses = null) {
    if (!meetingId || (!addedMessages?.length && !statuses)) return
    setSavedMeetings((current) => {
      const next = current.map((meeting) =>
        meeting.id === meetingId
          ? {
              ...meeting,
              updatedAt: new Date().toISOString(),
              messages: [...(Array.isArray(meeting.messages) ? meeting.messages : []), ...addedMessages],
              ...(statuses ? { roleStatuses: { ...(meeting.roleStatuses || {}), ...statuses } } : {}),
            }
          : meeting,
      )
      try {
        localStorage.setItem(meetingsStorageKey, JSON.stringify(next))
      } catch (error) {
        console.error('无法在本地保存会议记录', error)
      }
      return next
    })
  }

  function deleteSavedMeeting(meetingId) {
    const meeting = savedMeetings.find((item) => item.id === meetingId)
    if (!meeting || !window.confirm(`确定删除“${meeting.form.topic}”的本地记录吗？`)) return
    setSavedMeetings((current) => {
      const next = current.filter((item) => item.id !== meetingId)
      localStorage.setItem(meetingsStorageKey, JSON.stringify(next))
      return next
    })
    if (currentMeetingId === meetingId) setCurrentMeetingId(null)
  }

  function showNewMeeting() {
    setCurrentMeetingId(null)
    currentMeetingRef.current = null
    activeRunRef.current = null
    lastBatchRef.current = null
    setRoleModels(loadSavedRoleModels())
    setMessages([])
    setRoleStatuses({})
    setSummary('')
    setMeetingError('')
    setIsThinking(false)
    setView('setup')
    setMobileNav(false)
  }

  async function submitContribution(content) {
    const clean = content.trim()
    if (!clean || isThinking) return
    const meetingId = currentMeetingId
    const roundId = createMeetingId()
    const userMessage = { type: 'user', stage: 'user', roundId, author: '你', content: clean }
    const nextMessages = [...messages, userMessage]
    const transcript = transcriptText(nextMessages)
    const batch = {
      meetingId,
      roundId,
      stage: 'cross-examination',
      roles: activeRoles.map((role) => ({ ...role })),
      prompt: `原始议题：${form.topic}\n此前完整会议记录：\n${transcript}`,
      system: (role) => `你是 AI 会议中的"${role.name}"，职责是${role.description}。独立开场已经锁定，现在进入公开交叉质询：你能看到此前的完整会议记录，但看不到其他席位正在生成的本轮回答。请同时完成三件事：1. 直接回应主持人刚才的发言；2. 点名审阅至少一个其他议事席的具体观点，说明你支持、质疑或补充什么以及理由；3. 说明你的初始立场是否改变及原因。不要机械赞同，也不要为了反对而反对；不要替主持人下结论。控制在 300 字以内。`,
    }
    setMessages(nextMessages)
    activeRunRef.current = batch
    lastBatchRef.current = batch
    setRoleStatuses(createRoleStatuses(batch.roles, roundId, 'pending'))
    setMeetingError('')
    setIsThinking(true)
    try {
      const { messages: replies, statuses } = await runRoleBatch(batch)
      if (isCurrentRun(meetingId, roundId)) {
        setRoleStatuses(statuses)
        setMessages([...nextMessages, ...replies])
      } else {
        appendMeetingMessages(meetingId, replies, statuses)
      }
    } catch (error) {
      if (isCurrentRun(meetingId, roundId)) setMeetingError(error.message)
    } finally {
      if (isCurrentRun(meetingId, roundId)) setIsThinking(false)
    }
  }

  async function retryRole(roleId) {
    const batch = lastBatchRef.current
    if (!batch || batch.meetingId !== currentMeetingId || isThinking) return
    if (!getRoleStatusMeta(roleStatuses[roleId]?.status).retryable) return
    const role = activeRoles.find((item) => item.id === roleId) || batch.roles.find((item) => item.id === roleId)
    if (!role) return

    const retryBatch = { ...batch, roles: [{ ...role }] }
    activeRunRef.current = batch
    setRoleStatuses((current) => ({
      ...current,
      [roleId]: { ...current[roleId], status: 'pending', model: role.modelId, error: '', roundId: batch.roundId },
    }))
    setMeetingError('')
    setIsThinking(true)
    try {
      const { messages: replies, statuses } = await runRoleBatch(retryBatch)
      if (isCurrentRun(batch.meetingId, batch.roundId)) {
        setRoleStatuses((current) => ({ ...current, ...statuses }))
        if (replies.length) setMessages((current) => [...current, ...replies])
      } else {
        appendMeetingMessages(batch.meetingId, replies, statuses)
      }
    } catch (error) {
      if (isCurrentRun(batch.meetingId, batch.roundId)) setMeetingError(error.message)
    } finally {
      if (isCurrentRun(batch.meetingId, batch.roundId)) setIsThinking(false)
    }
  }

  async function finishMeeting() {
    if (isThinking || !messages.some((message) => message.type === 'user')) return
    setMeetingError('')
    setIsThinking(true)
    try {
      const moderator = models.includes('gpt-5.6-sol') ? 'gpt-5.6-sol' : models.includes('gpt-5.4-mini') ? 'gpt-5.4-mini' : models[0]
      const result = await requestModel(moderator, '你是会议主持人。你的任务是把讨论整理成可供人类决定的阶段纪要，不要把共识伪装成事实，也不要替用户做最终决定。', `议题：${form.topic}\n目标：${form.goal}\n限制：${form.constraints}\n\n完整讨论记录：\n${transcriptText(messages)}\n\n请用中文输出：1. 当前最有力的方案 2. 支持依据 3. 仍然存在的分歧 4. 主要风险 5. 各席位明确表达的立场变化及原因 6. 需要用户在下一轮决定的问题。不要超过 600 字。`, apiConfig)
      setSummary(result)
      setView('result')
    } catch (error) {
      setMeetingError(error.message)
    } finally {
      setIsThinking(false)
    }
  }

  function handleSaveConfig(newConfig) {
    setApiConfig(newConfig)
    localStorage.setItem('ai-meeting-api-config', JSON.stringify(newConfig))
    setShowSettings(false)
  }

  async function handleTestConnection(draftConfig) {
    setTestStatus(null)
    try {
      const headers = {}
      if (draftConfig.baseUrl) headers['x-api-base-url'] = draftConfig.baseUrl
      if (draftConfig.apiKey) headers['x-api-key'] = draftConfig.apiKey
      const response = await fetch('/api/models', { headers })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '连接失败')
      const count = (payload.data || []).length
      setTestStatus({ ok: true, message: `连接成功，发现 ${count} 个可用模型` })
    } catch (error) {
      setTestStatus({ ok: false, message: error.message })
    }
  }

  return (
    <div className="app-shell">
      {showSettings && (
        <SettingsModal
          config={apiConfig}
          onSave={handleSaveConfig}
          onClose={() => { setShowSettings(false); setTestStatus(null) }}
          onTest={handleTestConnection}
          testStatus={testStatus}
        />
      )}
      <header className="topbar">
        <Logo />
        <nav className={mobileNav ? 'main-nav is-open' : 'main-nav'} aria-label="主导航">
          <button className={view === 'setup' ? 'nav-item active' : 'nav-item'} onClick={showNewMeeting}>
            <Plus size={17} /> 发起会议
          </button>
          <button className={view === 'archive' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('archive'); setMobileNav(false) }}>
            <FileText size={17} /> 会议档案
          </button>
        </nav>
        <div className="top-actions">
          <button className="icon-button" aria-label="API 设置" title="API 提供商设置" onClick={() => setShowSettings(true)}>
            <Settings size={19} />
          </button>
          <button className="icon-button" aria-label="帮助" title="帮助"><CircleHelp size={19} /></button>
          <button className="avatar" aria-label="个人账户">S</button>
          <button className="menu-button" aria-label="打开导航" onClick={() => setMobileNav((value) => !value)}>
            {mobileNav ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main>
        {view === 'setup' && (
          <SetupView
            form={form}
            selected={selected}
            updateField={updateField}
            toggleRole={toggleRole}
            startMeeting={startMeeting}
            apiStatus={apiStatus}
            models={models}
            roleModels={roleModels}
            updateRoleModel={updateRoleModel}
          />
        )}
        {view === 'meeting' && (
          <InteractiveMeetingView
            form={form}
            roles={activeRoles}
            models={models}
            roleStatuses={roleStatuses}
            messages={messages}
            isThinking={isThinking}
            error={meetingError}
            onModelChange={updateRoleModel}
            onSend={submitContribution}
            onRetryRole={retryRole}
            onFinish={finishMeeting}
          />
        )}
        {view === 'result' && (
          <LiveSummaryView form={form} roles={activeRoles} messages={messages} summary={summary} onBack={() => setView('meeting')} />
        )}
        {view === 'archive' && (
          <ArchiveView
            meetings={savedMeetings}
            activeMeeting={savedMeetings.find((meeting) => meeting.id === currentMeetingId) || null}
            onResume={resumeMeeting}
            onOpen={openSavedMeeting}
            onDelete={deleteSavedMeeting}
            onNew={showNewMeeting}
          />
        )}
      </main>
    </div>
  )
}

function SetupView({ form, selected, updateField, toggleRole, startMeeting, apiStatus, models, roleModels, updateRoleModel }) {
  const canStart = form.topic.trim().length > 0 && selected.length >= 3 && apiStatus === 'ready'
  return (
    <div className="chat-page setup-page page-enter">
      <header className="chat-header">
        <div>
          <span className="chat-status"><span /> 新会议</span>
          <h1>发起讨论</h1>
        </div>
        <span className="header-note"><Scale size={15} /> 你将担任会议主持人</span>
      </header>

      <form className="setup-workspace" onSubmit={startMeeting}>
        <section className="setup-conversation">
          <div className="guide-message">
            <span className="guide-avatar"><Bot size={19} /></span>
            <div>
              <div className="message-meta"><strong>圆桌助手</strong><span>会议准备</span></div>
              <p>你希望议事席共同讨论什么？请把目标、已知事实和不能突破的边界一并告诉我。</p>
            </div>
          </div>

          <div className="brief-composer">
            <div className="composer-title"><span>会议简报</span><small>信息越具体，讨论越有针对性</small></div>
          <div className="form-stack">
            <label className="field field-primary">
              <span>议题 <b>必填</b></span>
              <textarea name="topic" value={form.topic} onChange={updateField} rows="2" maxLength="120" placeholder="需要会议回答的核心问题是什么？" required />
              <small>{form.topic.length}/120</small>
            </label>
            <label className="field">
              <span>你想得到什么结果</span>
              <textarea name="goal" value={form.goal} onChange={updateField} rows="2" placeholder="你希望这次会议帮助达成什么？" />
            </label>
            <label className="field">
              <span>背景与已知事实</span>
              <textarea name="context" value={form.context} onChange={updateField} rows="3" placeholder="现状、已有数据、相关团队……" />
            </label>
            <label className="field">
              <span>限制条件</span>
              <textarea name="constraints" value={form.constraints} onChange={updateField} rows="2" placeholder="预算、时间、合规要求等不可突破的边界" />
            </label>
          </div>
            <div className="setup-submit-row">
              <p className={apiStatus === 'error' ? 'connection-state api-error' : 'connection-state'}>
                {apiStatus === 'ready' ? <><CheckCircle2 size={14} /> 模型服务已连接</> : apiStatus === 'loading' ? <><LoaderCircle size={14} className="spin" /> 正在连接模型服务</> : <><AlertTriangle size={14} /> 请检查 API 设置</>}
              </p>
              <button className="primary-action" type="submit" disabled={!canStart}>
                开始会议 <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </section>

        <aside className="setup-roster">
          <div className="roster-heading">
            <div><h2>议事席</h2><p>选择 3–5 位角色</p></div>
            <span>{selected.length}/5</span>
          </div>
          <div className="role-list">
            {roles.map((role) => {
              const Icon = role.icon
              const active = selected.includes(role.id)
              return (
                <div key={role.id} className={active ? 'role-wrapper selected' : 'role-wrapper'}>
                  <button
                    type="button"
                    className="role-option"
                    onClick={() => toggleRole(role.id)}
                    aria-pressed={active}
                  >
                    <span className="role-icon" style={{ '--role-color': role.color }}><Icon size={18} /></span>
                    <span className="role-copy"><strong>{role.name}</strong><small>{role.description}</small></span>
                    <span className="role-check">{active && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                  {active && models.length > 0 && (
                    <div className="role-model-pick">
                      <Wrench size={11} />
                      <select
                        value={roleModels[role.id] || models[0]}
                        onChange={(e) => updateRoleModel(role.id, e.target.value)}
                        className="model-select"
                        aria-label={`配置${role.name}使用的模型`}
                      >
                        {models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="roster-note"><Users size={14} /> 每位角色先独立思考，再公开讨论。</p>
        </aside>
      </form>
    </div>
  )
}

function InteractiveMeetingView({ form, roles: activeRoles, models, roleStatuses, messages, isThinking, error, onModelChange, onSend, onRetryRole, onFinish }) {
  const [draft, setDraft] = useState('')
  const hasUserTurn = messages.some((message) => message.type === 'user')

  function submit(event) {
    event.preventDefault()
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    <div className="meeting-screen page-enter">
      <header className="chat-header meeting-header">
        <div>
          <span className="chat-status live"><span /> 会议进行中 · 第 {hasUserTurn ? '2' : '1'} 轮</span>
          <h1>{form.topic}</h1>
        </div>
        <button className="summary-action" type="button" disabled={!hasUserTurn || isThinking} onClick={onFinish}><FileText size={16} /> 形成阶段纪要</button>
      </header>

      <div className="meeting-workspace">
        <section className="conversation-column">
          <div className="discussion-feed" aria-live="polite">
            <div className="round-divider"><span>独立开场</span><small><CheckCircle2 size={13} /> 各席位观点已锁定并公开</small></div>
          {messages.length === 0 && isThinking && (
              <div className="thinking-state"><LoaderCircle size={23} className="spin" /><strong>议事席正在独立思考</strong><span>提交前彼此不可见</span></div>
          )}
          {messages.map((message, index) => {
            const role = activeRoles.find((item) => item.id === message.roleId)
            const Icon = role?.icon || Users
              const startsPublicRound = message.stage === 'user' && messages[index - 1]?.stage === 'opening'
            return (
                <div key={`${message.author}-${index}`}>
                  {startsPublicRound && <div className="round-divider"><span>公开讨论</span><small>所有席位可见此前记录</small></div>}
                  <article className={message.type === 'user' ? 'speech user-speech' : 'speech'}>
                    <div className="speech-avatar" style={{ '--role-color': role?.color || '#20282d' }}>{message.type === 'user' ? '你' : <Icon size={17} />}</div>
                    <div className="speech-body">
                      <div className="speech-byline"><strong>{message.author}</strong><small>{message.type === 'user' ? '主持人' : message.stage === 'opening' ? '独立开场' : '公开质询'}</small></div>
                      <MarkdownContent>{message.content}</MarkdownContent>
                      {message.model && <span className="model-stamp">{message.model}</span>}
                    </div>
                  </article>
                </div>
            )
          })}
            {isThinking && messages.length > 0 && <div className="replying-state"><LoaderCircle size={17} className="spin" /><span><strong>议事席正在回应</strong>本轮完成后统一公开</span></div>}
          </div>

          <section className="human-turn">
            <form onSubmit={submit}>
              <textarea value={draft} maxLength="800" onChange={(event) => setDraft(event.target.value)} placeholder="补充事实、质疑假设，或点名请某个议事席展开……" rows="3" disabled={isThinking} />
              <div className="composer-footer">
                <span>{isThinking ? '请等待本轮回应完成' : `${draft.length}/800`}</span>
                <button className="send-button" type="submit" aria-label="发送发言" title="发送发言" disabled={!draft.trim() || isThinking}><Send size={17} /></button>
              </div>
            </form>
            {error && <div className="room-error"><AlertTriangle size={15} /> {error}</div>}
            <p className="composer-hint">你的发言会开启下一轮，所有议事席将并行回应。</p>
          </section>
        </section>

        <aside className="participant-panel">
          <div className="participant-panel-head"><div><h2>会议成员</h2><p>{activeRoles.length} 个 AI 议事席 · 你主持</p></div><Users size={18} /></div>
          <div className="participant-list">
            <div className="host-member"><span>你</span><div><strong>会议主持人</strong><small>决定讨论方向</small></div><i /></div>
            {activeRoles.map((role) => {
              const Icon = role.icon
              const roleStatus = roleStatuses[role.id] || { status: 'idle' }
              const statusMeta = getRoleStatusMeta(roleStatus.status)
              const StatusIcon = statusMeta.Icon
              return (
                <div className="table-member" key={role.id}>
                  <span className="role-icon" style={{ '--role-color': role.color }}><Icon size={15} /></span>
                  <label className="table-member-config">
                    <strong>{role.name}</strong>
                    <select
                      value={role.modelId}
                      onChange={(event) => onModelChange(role.id, event.target.value)}
                      disabled={isThinking}
                      aria-label={`修改${role.name}使用的模型`}
                      title={isThinking ? '本轮响应完成后可切换模型' : `修改${role.name}后续使用的模型`}
                    >
                      {models.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <div className="table-member-state">
                    <span
                      className={`seat-status ${statusMeta.className}`}
                      title={roleStatus.error || statusMeta.label}
                      aria-live="polite"
                    >
                      <StatusIcon size={12} className={roleStatus.status === 'pending' ? 'spin' : ''} />
                      <span>{statusMeta.label}</span>
                    </span>
                    {statusMeta.retryable && (
                      <button
                        className="retry-role-button"
                        type="button"
                        onClick={() => onRetryRole(role.id)}
                        disabled={isThinking}
                        aria-label={`重试${role.name}`}
                        title={roleStatus.status === 'unavailable' ? '切换模型后重试该席位' : `重试${role.name}`}
                      >
                        <RotateCw size={11} /> 重试
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="model-change-note"><Wrench size={12} /> 模型切换从下一轮生效。</p>
          <div className="meeting-rule"><CheckCircle2 size={15} /><p><strong>当前议事规则</strong><span>同轮回答并行生成，席位之间不可互相抄看。</span></p></div>
        </aside>
      </div>
    </div>
  )
}

function LiveSummaryView({ form, roles: activeRoles, messages, summary, onBack }) {
  return (
    <div className="chat-page summary-page page-enter">
      <header className="chat-header">
        <div><span className="chat-status complete"><CheckCircle2 size={13} /> 阶段纪要已形成</span><h1>{form.topic}</h1></div>
        <button className="summary-action" onClick={onBack}><ArrowLeft size={16} /> 继续讨论</button>
      </header>
      <div className="summary-conversation">
        <div className="guide-message summary-intro">
          <span className="guide-avatar"><Scale size={19} /></span>
          <div><div className="message-meta"><strong>会议主持</strong><span>基于当前讨论</span></div><p>我已整理此刻最有力的方案、依据、分歧和待决问题。这份纪要不会替你作出最终决定。</p></div>
        </div>
        <article className="summary-document">
          <div className="summary-document-head"><div><FileText size={18} /><strong>阶段会议纪要</strong></div><span>{activeRoles.length + 1} 位参与者 · {messages.filter((item) => item.type === 'user').length} 轮主持发言</span></div>
          <MarkdownContent className="summary-text">{summary}</MarkdownContent>
        </article>
        <div className="summary-next"><Sparkles size={17} /><span><strong>结论仍可被新信息改变</strong>继续追问，或回到新会议讨论另一个议题。</span><button onClick={onBack}>继续讨论 <ChevronRight size={16} /></button></div>
      </div>
    </div>
  )
}

function MeetingView({ form, roles: activeRoles, phase, onSkip }) {
  return (
    <div className="meeting-page page-enter">
      <div className="meeting-meta">
        <span className="live-dot" /> 会议进行中 <span>YR-0726-018</span>
      </div>
      <h1>{form.topic}</h1>
      <p>各议事席仅在独立分析阶段互不可见；初始观点锁定后将公开并进入交叉质询。</p>

      <section className="deliberation-track" aria-label="会议进度">
        <div className="track-line"><span style={{ width: `${(phase / (phases.length - 1)) * 100}%` }} /></div>
        {phases.map((item, index) => {
          const Icon = item.icon
          const state = index < phase ? 'complete' : index === phase ? 'current' : 'pending'
          return (
            <div className={`track-stage ${state}`} key={item.label}>
              <div className="stage-node">{state === 'complete' ? <Check size={19} /> : <Icon size={20} />}</div>
              <strong>{item.label}</strong>
              <span>{state === 'current' ? '正在进行' : state === 'complete' ? '已完成' : item.detail}</span>
            </div>
          )
        })}
      </section>

      <section className="participant-board">
        <div className="board-heading">
          <div><span className="section-kicker">DELIBERATION FLOOR</span><h2>{phases[phase].label}</h2></div>
          <span className="secure-state"><span /> {phase === 0 ? '首轮隔离' : '观点已公开'}</span>
        </div>
        <div className="participant-grid">
          {activeRoles.map((role, index) => {
            const Icon = role.icon
            const done = index < Math.max(0, phase)
            return (
              <article className="participant" key={role.id} style={{ '--delay': `${index * 110}ms` }}>
                <div className="participant-top">
                  <span className="role-icon large" style={{ '--role-color': role.color }}><Icon size={20} /></span>
                  <span className={done ? 'status-tag done' : 'status-tag working'}>{done ? '已提交' : '分析中'}</span>
                </div>
                <strong>{role.name}</strong><span>{role.model}</span>
                <div className="thinking-lines"><i /><i /><i /></div>
              </article>
            )
          })}
          <article className="participant moderator">
            <div className="participant-top"><span className="role-icon large"><Scale size={20} /></span><span className="status-tag waiting">观察中</span></div>
            <strong>会议主持人</strong><span>Chair</span>
            <div className="thinking-lines"><i /><i /><i /></div>
          </article>
        </div>
      </section>
      <button className="text-action" onClick={onSkip}>查看演示决议 <ChevronRight size={16} /></button>
    </div>
  )
}

function ResultView({ form, roles: activeRoles, onBack }) {
  return (
    <div className="result-page page-enter">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> 返回新会议</button>
      <section className="result-header">
        <div className="verdict-stamp"><CheckCircle2 size={25} /><span>形成决议</span></div>
        <div className="result-title">
          <span className="section-kicker">DECISION RECORD · YR-0726-018</span>
          <h1>{form.topic}</h1>
          <div className="result-meta"><span><Clock3 size={15} /> 3 分 12 秒</span><span><Users size={15} /> {activeRoles.length + 1} 位参与者</span><span>2026.07.30</span></div>
        </div>
        <div className="confidence-dial" aria-label="决议置信度 78%"><strong>78</strong><span>置信度</span></div>
      </section>

      <div className="result-layout">
        <div className="result-main">
          <section className="recommendation">
            <div className="section-label"><Target size={18} /> 推荐方案</div>
            <h2>先做受控试点，不直接替代现有客服流程</h2>
            <p>用 6 周时间在物流查询和退换货规则两个高频场景中验证 AI 客服，限制为信息查询与建议生成；涉及退款、承诺和客诉升级的操作继续由人工确认。</p>
            <div className="condition-row"><strong>适用条件</strong><span>知识库可追溯</span><span>人工可随时接管</span><span>每周审查错误样本</span></div>
          </section>

          <section className="evidence-section">
            <div className="content-heading"><div><span className="section-kicker">WHY THIS PATH</span><h2>形成判断的关键依据</h2></div><span className="evidence-count">4 条依据</span></div>
            <div className="evidence-list">
              <Evidence number="01" title="重复咨询占比足够高" text="62% 的问题边界相对清晰，适合先验证自动回答的准确率与分流效果。" source="事实核查员 · 高可信" />
              <Evidence number="02" title="不可逆操作风险可隔离" text="把退款等高风险动作留给人工，可以在试点期控制客户和合规风险。" source="风险审查员 · 高可信" />
              <Evidence number="03" title="两个月足以验证方向" text="6 周试点加 2 周复盘，能观察解决率、转人工率和满意度，但不足以证明长期 ROI。" source="方案提出者 · 中高可信" />
              <Evidence number="04" title="团队能力决定了方案边界" text="没有专职 AI 工程师，首期应使用可配置产品并压缩集成范围，避免自建系统。" source="用户利益代表 · 中高可信" />
            </div>
          </section>

          <section className="next-actions">
            <div className="section-label"><CheckCircle2 size={18} /> 下一步行动</div>
            <ol>
              <li><span>1</span><div><strong>建立 200 条基准问题集</strong><p>覆盖高频问法、边界案例和现有客服标准答案。</p></div><em>第 1 周</em></li>
              <li><span>2</span><div><strong>配置只读试点并接入人工转接</strong><p>先不上自动退款、主动承诺等写入动作。</p></div><em>第 2–3 周</em></li>
              <li><span>3</span><div><strong>按统一指标决定是否扩大</strong><p>自动解决率 ≥ 35%，满意度降幅 ≤ 2%，严重错误为 0。</p></div><em>第 8 周</em></li>
            </ol>
          </section>
        </div>

        <aside className="result-sidebar">
          <section className="consensus-panel">
            <div className="section-label"><Users size={18} /> 共识与分歧</div>
            <div className="consensus-item agree"><strong><Check size={16} /> 核心共识</strong><p>所有参与者均反对一次性全量上线，并认可"低风险查询先行"。</p></div>
            <div className="consensus-item disagree"><strong><Scale size={16} /> 关键分歧</strong><p>方案提出者主张首期覆盖 3 类场景；风险审查员建议只做 2 类，以降低知识库遗漏风险。</p></div>
          </section>
          <section className="risk-panel">
            <div className="section-label"><AlertTriangle size={18} /> 主要风险</div>
            <ul>
              <li><i className="risk-high" /><div><strong>错误回答被当作承诺</strong><p>需明确回答边界并保留完整日志。</p></div></li>
              <li><i className="risk-medium" /><div><strong>知识库更新不及时</strong><p>指定业务负责人维护规则版本。</p></div></li>
              <li><i className="risk-medium" /><div><strong>样本期无法证明长期收益</strong><p>试点结论需标注季节性限制。</p></div></li>
            </ul>
          </section>
          <section className="change-panel">
            <div className="section-label"><History size={18} /> 立场变化</div>
            <p><strong>2 位</strong>参与者在质询后调整了建议。</p>
            <button>查看完整议事记录 <ChevronRight size={16} /></button>
          </section>
        </aside>
      </div>
      <footer className="human-note"><Sparkles size={17} /><p><strong>决策权仍在你手中</strong>这份决议基于当前输入和参与者判断，不替代业务负责人最终决策。</p></footer>
    </div>
  )
}

function Evidence({ number, title, text, source }) {
  return <article className="evidence"><span>{number}</span><div><h3>{title}</h3><p>{text}</p><small>{source}</small></div></article>
}

function ArchiveView({ meetings, activeMeeting, onResume, onOpen, onDelete, onNew }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const filteredMeetings = meetings.filter((meeting) => {
    if (!normalizedQuery) return true
    return [meeting.form.topic, meeting.form.goal, meeting.form.context, meeting.summary]
      .some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  })

  return (
    <div className="chat-page archive-page page-enter">
      <header className="chat-header">
        <div><span className="chat-status"><History size={13} /> 本地记录</span><h1>会议档案</h1></div>
        <button className="summary-action primary" onClick={onNew}><Plus size={16} /> 发起会议</button>
      </header>
      <div className="archive-content">
        {activeMeeting && (
          <div className="resume-banner">
            <div className="resume-copy">
              <span className="resume-icon">{activeMeeting.summary ? <FileText size={16} /> : <History size={16} />}</span>
              <div>
                <strong>{activeMeeting.summary ? '你正在查看的会议' : '你有一个正在进行的会议'}</strong>
                <span className="resume-topic">{activeMeeting.form.topic}</span>
              </div>
            </div>
            <button className="resume-button" type="button" onClick={onResume}>
              {activeMeeting.summary ? '查看纪要' : '继续会议'} <ChevronRight size={15} />
            </button>
          </div>
        )}
        <div className="archive-toolbar">
          <div><LayoutDashboard size={17} /><strong>全部会议</strong><span>{meetings.length}</span></div>
        <label className="archive-search"><SearchCheck size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索议题或纪要" aria-label="搜索会议" /></label>
        </div>
        {filteredMeetings.length > 0 ? (
          <div className="archive-list">
            {filteredMeetings.map((meeting) => (
              <div className="archive-row" key={meeting.id}>
                <button className="archive-open" onClick={() => onOpen(meeting)} aria-label={`打开会议：${meeting.form.topic}`}>
                  <span className={meeting.summary ? 'archive-status complete' : 'archive-status'}>{meeting.summary ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</span>
                  <span className="archive-copy"><strong>{meeting.form.topic}</strong><small>{meeting.summary ? '已形成阶段纪要' : '讨论进行中'} · {meeting.messages?.length || 0} 条发言 · {meeting.selected?.length || 0} 个 AI 议事席</small></span>
                  <span className="archive-state">{meeting.summary ? '已整理' : '可继续'}</span>
                  <span className="archive-date">{formatMeetingDate(meeting.updatedAt || meeting.createdAt)}</span>
                  <ChevronRight size={18} />
                </button>
                <button className="archive-delete" onClick={() => onDelete(meeting.id)} aria-label={`删除会议：${meeting.form.topic}`} title="删除本地记录"><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="archive-empty">
            <FileText size={28} />
            <strong>{meetings.length ? '没有匹配的会议' : '还没有本地会议记录'}</strong>
            <span>{meetings.length ? '换一个关键词试试' : '开始会议后，讨论内容会自动保存在这里。'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

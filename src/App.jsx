import { useEffect, useState } from 'react'
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
  Scale,
  SearchCheck,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
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
    modelId: 'claude-sonnet-4-6',
    description: '提出可落地路径与取舍',
    color: '#2457d6',
    icon: Lightbulb,
  },
  {
    id: 'critic',
    name: '反方辩手',
    model: 'Sage',
    modelId: 'glm-5.2',
    description: '挑战前提与乐观假设',
    color: '#e4582c',
    icon: MessageSquareWarning,
  },
  {
    id: 'risk',
    name: '风险审查员',
    model: 'Nova',
    modelId: 'gpt-5.6-sol',
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
  { label: '独立分析', detail: '参与者互不可见', icon: Bot },
  { label: '交叉质询', detail: '检查假设与证据', icon: MessageSquareWarning },
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
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: getApiHeaders(apiConfig),
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || payload.error || '模型没有返回结果')
  return payload.choices?.[0]?.message?.content?.trim() || '这个议事席暂时没有提交内容。'
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
  try {
    return await requestModel(role.modelId, system, prompt, apiConfig)
  } catch (error) {
    return `本轮没有成功提交：${error.message}。这不是会议结论，主持人可以选择忽略这一席或稍后重试。`
  }
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
  const [roleModels, setRoleModels] = useState({})
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [testStatus, setTestStatus] = useState(null)

  const selectedRoles = roles.filter((role) => selected.includes(role.id))

  const activeRoles = selectedRoles.map((role) => ({
    ...role,
    modelId: roleModels[role.id] || models[0] || role.modelId,
  }))

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
        setRoleModels((prev) => defaultAssignModels(ids, selected, prev))
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
      if (!prev[id] && models.length > 0) {
        return { ...prev, [id]: models[0] }
      }
      return prev
    })
  }

  function updateRoleModel(roleId, modelId) {
    setRoleModels((prev) => ({ ...prev, [roleId]: modelId }))
  }

  async function startMeeting(event) {
    event.preventDefault()
    if (!form.topic.trim()) return
    setMessages([])
    setSummary('')
    setMeetingError('')
    setView('meeting')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setIsThinking(true)
    try {
      const prompt = `会议议题：${form.topic}\n决策目标：${form.goal}\n必要背景：${form.context}\n限制条件：${form.constraints}\n\n请先独立分析这个议题，不要假装已经看过其他参与者的意见。给出你的初步立场、两条关键依据，并提出一个你希望会议主持人（用户）回答的问题。控制在 250 字以内。`
      const opening = await Promise.all(activeRoles.map(async (role) => ({
        type: 'ai', roleId: role.id, author: role.name, model: role.modelId,
        content: await askRole(role, `你是 AI 会议中的"${role.name}"。你的职责是${role.description}。你必须清楚区分事实、推测和价值判断，不要替用户做最终决定。`, prompt, apiConfig),
      })))
      setMessages(opening)
    } catch (error) {
      setMeetingError(error.message)
    } finally {
      setIsThinking(false)
    }
  }

  async function submitContribution(content) {
    const clean = content.trim()
    if (!clean || isThinking) return
    const userMessage = { type: 'user', author: '你', content: clean }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setMeetingError('')
    setIsThinking(true)
    try {
      const transcript = transcriptText(nextMessages)
      const replies = await Promise.all(activeRoles.map(async (role) => ({
        type: 'ai', roleId: role.id, author: role.name, model: role.modelId,
        content: await askRole(role, `你是 AI 会议中的"${role.name}"。刚才用户已经发言。请直接回应用户的观点，指出你同意或不同意的地方，补充一个具体问题或反例。不要替主持人下结论。控制在 220 字以内。`, `原始议题：${form.topic}\n当前会议记录：\n${transcript}`, apiConfig),
      })))
      setMessages([...nextMessages, ...replies])
    } catch (error) {
      setMeetingError(error.message)
    } finally {
      setIsThinking(false)
    }
  }

  async function finishMeeting() {
    if (isThinking || messages.length < activeRoles.length + 1) return
    setMeetingError('')
    setIsThinking(true)
    try {
      const moderator = models.includes('gpt-5.6-sol') ? 'gpt-5.6-sol' : models.includes('gpt-5.4-mini') ? 'gpt-5.4-mini' : models[0]
      const result = await requestModel(moderator, '你是会议主持人。你的任务是把讨论整理成可供人类决定的阶段纪要，不要把共识伪装成事实，也不要替用户做最终决定。', `议题：${form.topic}\n目标：${form.goal}\n限制：${form.constraints}\n\n完整讨论记录：\n${transcriptText(messages)}\n\n请用中文输出：1. 当前最有力的方案 2. 支持依据 3. 仍然存在的分歧 4. 主要风险 5. 需要用户在下一轮决定的问题。不要超过 600 字。`, apiConfig)
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
          <button className={view === 'setup' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('setup'); setMobileNav(false) }}>
            <Plus size={17} /> 新会议
          </button>
          <button className={view === 'archive' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('archive'); setMobileNav(false) }}>
            <FileText size={17} /> 决议档案
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
            messages={messages}
            isThinking={isThinking}
            error={meetingError}
            onSend={submitContribution}
            onFinish={finishMeeting}
          />
        )}
        {view === 'result' && (
          <LiveSummaryView form={form} roles={activeRoles} messages={messages} summary={summary} onBack={() => setView('meeting')} />
        )}
        {view === 'archive' && (
          <ArchiveView onOpen={() => setView('result')} onNew={() => setView('setup')} />
        )}
      </main>
    </div>
  )
}

function SetupView({ form, selected, updateField, toggleRole, startMeeting, apiStatus, models, roleModels, updateRoleModel }) {
  const canStart = form.topic.trim().length > 0 && selected.length >= 3 && apiStatus === 'ready'
  return (
    <div className="setup-page page-enter">
      <section className="page-heading">
        <div>
          <span className="section-kicker">NEW SESSION</span>
          <h1>发起一场有结论的会议</h1>
          <p>先定义问题与边界。参与者会向你发问，你来决定讨论往哪里走。</p>
        </div>
        <div className="protocol-note">
          <span className="protocol-icon"><Scale size={19} /></span>
          <div><strong>标准议事协议</strong><span>4 个阶段 · 约 3 分钟</span></div>
        </div>
      </section>

      <form className="workspace" onSubmit={startMeeting}>
        <section className="brief-panel">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div><h2>明确议题</h2><p>具体的问题会得到更有用的决议。</p></div>
          </div>
          <div className="form-stack">
            <label className="field field-primary">
              <span>会议议题 <b>必填</b></span>
              <textarea name="topic" value={form.topic} onChange={updateField} rows="2" placeholder="需要会议回答的核心问题是什么？" required />
              <small>{form.topic.length}/120</small>
            </label>
            <label className="field">
              <span>决策目标</span>
              <textarea name="goal" value={form.goal} onChange={updateField} rows="2" placeholder="你希望这次会议帮助达成什么？" />
            </label>
            <label className="field">
              <span>必要背景</span>
              <textarea name="context" value={form.context} onChange={updateField} rows="3" placeholder="现状、已有数据、相关团队……" />
            </label>
            <label className="field">
              <span>限制条件</span>
              <textarea name="constraints" value={form.constraints} onChange={updateField} rows="2" placeholder="预算、时间、合规要求等不可突破的边界" />
            </label>
          </div>
        </section>

        <aside className="roles-panel">
          <div className="panel-heading compact">
            <span className="step-number">02</span>
            <div><h2>组建议事席</h2><p>选择 3–5 个互补角色，并为每位指定模型。</p></div>
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
          <div className="selection-status">
            <div><Users size={17} /><span>已选择 <strong>{selected.length}</strong> 位参与者</span></div>
            <span>{models.length ? `已连接 ${models.length} 个模型` : '正在连接模型'}</span>
          </div>
          <button className="primary-action" type="submit" disabled={!canStart}>
            开始会议 <ArrowRight size={18} />
          </button>
          <p className={apiStatus === 'error' ? 'privacy-line api-error' : 'privacy-line'}>
            {apiStatus === 'ready' ? <><CheckCircle2 size={14} /> API 已连接，会议会等待你的每次发言</> : apiStatus === 'loading' ? <><LoaderCircle size={14} className="spin" /> 正在连接模型服务</> : <><AlertTriangle size={14} /> {`模型服务未连接：${apiStatus === 'error' ? '请检查 .env.local 或 API 设置' : ''}`}</>}
          </p>
        </aside>
      </form>
    </div>
  )
}

function InteractiveMeetingView({ form, roles: activeRoles, messages, isThinking, error, onSend, onFinish }) {
  const [draft, setDraft] = useState('')
  const hasUserTurn = messages.some((message) => message.type === 'user')

  function submit(event) {
    event.preventDefault()
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    <div className="live-room page-enter">
      <div className="room-topline">
        <div><span className="live-dot" /> LIVE DISCUSSION <span>· {activeRoles.length} 个 AI 议事席</span></div>
        <span className="room-rule"><Users size={14} /> 你是主持人，不是旁观者</span>
      </div>
      <section className="room-heading">
        <span className="section-kicker">OPEN FLOOR · ROUND {hasUserTurn ? '02' : '01'}</span>
        <h1>{form.topic}</h1>
        <p>AI 已经提交初步判断。读完后，在下方写下你的事实、疑问或反对意见，下一轮回应会围绕你的发言展开。</p>
      </section>

      <div className="room-layout">
        <section className="discussion-feed">
          <div className="feed-header"><div><strong>讨论现场</strong><span>{messages.length} 条发言</span></div><span className="feed-lock"><CheckCircle2 size={14} /> 独立分析已完成</span></div>
          {messages.length === 0 && isThinking && (
            <div className="thinking-state"><LoaderCircle size={23} className="spin" /><strong>议事席正在准备各自的开场观点</strong><span>他们不会看到彼此的回答</span></div>
          )}
          {messages.map((message, index) => {
            const role = activeRoles.find((item) => item.id === message.roleId)
            const Icon = role?.icon || Users
            return (
              <article className={message.type === 'user' ? 'speech user-speech' : 'speech'} key={`${message.author}-${index}`}>
                <div className="speech-avatar" style={{ '--role-color': role?.color || '#172027' }}>{message.type === 'user' ? '你' : <Icon size={17} />}</div>
                <div className="speech-body">
                  <div className="speech-byline"><strong>{message.author}</strong>{message.model && <span>{message.model}</span>}<small>{message.type === 'user' ? '主持人发言' : index < activeRoles.length ? '独立开场' : '回应你的发言'}</small></div>
                  <MarkdownContent>{message.content}</MarkdownContent>
                </div>
              </article>
            )
          })}
          {isThinking && messages.length > 0 && <div className="replying-state"><LoaderCircle size={17} className="spin" /> AI 正在回应你的发言…</div>}
        </section>

        <aside className="room-sidebar">
          <div className="room-card human-role">
            <div className="room-card-label"><span className="section-kicker">YOUR ROLE</span><span className="human-badge">主持人</span></div>
            <h2>把你的判断放进来</h2>
            <p>你可以补充现场事实、质疑某个假设，或要求某位议事席展开。没有你的发言，会议不会进入下一轮。</p>
          </div>
          <div className="room-card participant-list">
            <div className="room-card-label"><span className="section-kicker">AT THE TABLE</span><span>{activeRoles.length} 位</span></div>
            {activeRoles.map((role) => { const Icon = role.icon; return <div className="table-member" key={role.id}><span className="role-icon" style={{ '--role-color': role.color }}><Icon size={15} /></span><span><strong>{role.name}</strong><small>{role.modelId}</small></span><i /></div> })}
          </div>
        </aside>
      </div>

      <section className="human-turn">
        <div className="turn-label"><span className="turn-marker">你</span><div><strong>轮到你了</strong><span>写完后，AI 会分别回应你的发言</span></div></div>
        <form onSubmit={submit}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="我想补充…… / 我不同意…… / 请解释……" rows="3" disabled={isThinking} />
          <div className="composer-footer"><span>{draft.length}/800</span><button className="send-button" type="submit" disabled={!draft.trim() || isThinking}>发言并继续 <Send size={16} /></button></div>
        </form>
        {error && <div className="room-error"><AlertTriangle size={15} /> {error}</div>}
        <div className="finish-row"><span>至少完成一轮你的发言后，才可以整理纪要</span><button className="finish-button" type="button" disabled={!hasUserTurn || isThinking} onClick={onFinish}>形成阶段纪要 <ArrowRight size={16} /></button></div>
      </section>
    </div>
  )
}

function LiveSummaryView({ form, roles: activeRoles, messages, summary, onBack }) {
  return (
    <div className="live-summary page-enter">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> 回到讨论现场</button>
      <div className="summary-banner"><div><span className="section-kicker">HUMAN-IN-THE-LOOP RECORD</span><h1>{form.topic}</h1><p>这不是自动答案，而是基于你参与过的讨论形成的阶段纪要。</p></div><span className="summary-mark"><CheckCircle2 size={23} /> 已整理</span></div>
      <div className="summary-layout">
        <section className="summary-copy"><div className="section-label"><Scale size={18} /> 主持人纪要</div><MarkdownContent className="summary-text">{summary}</MarkdownContent></section>
        <aside className="summary-side"><div className="section-label"><Users size={18} /> 参与者</div>{activeRoles.map((role) => <div className="summary-member" key={role.id}><span className="role-icon" style={{ '--role-color': role.color }}><role.icon size={15} /></span><div><strong>{role.name}</strong><small>{role.modelId}</small></div></div>)}<div className="summary-member user"><span>你</span><div><strong>会议主持人</strong><small>参与了 {messages.filter((item) => item.type === 'user').length} 轮发言</small></div></div></aside>
      </div>
      <div className="summary-next"><Sparkles size={17} /><strong>下一步不是接受答案，而是决定继续追问什么。</strong><button onClick={onBack}>继续讨论 <ChevronRight size={16} /></button></div>
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
      <p>各议事席正在按标准协议工作。独立分析阶段互不可见。</p>

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
          <span className="secure-state"><span /> 隔离工作区</span>
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

function ArchiveView({ onOpen, onNew }) {
  return (
    <div className="archive-page page-enter">
      <section className="page-heading">
        <div><span className="section-kicker">DECISION ARCHIVE</span><h1>决议档案</h1><p>回看依据、分歧与立场变化，而不只是最终答案。</p></div>
        <button className="secondary-action" onClick={onNew}><Plus size={17} /> 新会议</button>
      </section>
      <div className="archive-toolbar"><div><LayoutDashboard size={17} /><strong>全部决议</strong><span>1</span></div><button><SearchCheck size={17} /> 搜索</button></div>
      <button className="archive-row" onClick={onOpen}>
        <span className="archive-status"><CheckCircle2 size={19} /></span>
        <span className="archive-copy"><strong>我们是否应该把 AI 客服接入现有售后流程？</strong><small>受控试点 · 先覆盖物流查询与退换货规则</small></span>
        <span className="archive-score"><strong>78%</strong><small>置信度</small></span>
        <span className="archive-date">2026.07.30</span>
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

export default App

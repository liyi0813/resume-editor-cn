import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { linter, lintGutter } from '@codemirror/lint'
import { defaultHighlightStyle } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { ChevronDown, FileText, ImagePlus, Printer, RotateCcw, X } from 'lucide-react'
import './App.css'

type AuthUser = {
  id: number
  username: string
}

type AuthMode = 'login' | 'register'

type ResumeDocument = {
  meta: {
    name: string
    role: string
    phone: string
    email: string
    hometown: string
    link: string
    contact: string
    photo: string
  }
  blocks: ResumeBlock[]
}

type ResumeBlock = SectionBlock | EntryBlock | FieldBlock | BulletBlock | TextBlock

type SectionBlock = {
  type: 'section'
  title: string
}

type EntryBlock = {
  type: 'entry'
  title: string
  subtitle: string
  date: string
  sectionTitle?: string
  sectionEntryIndex?: number
  fields: FieldBlock[]
  bullets: BulletBlock[]
}

type FieldBlock = {
  type: 'field'
  label: string
  value: string
}

type BulletBlock = {
  type: 'bullet'
  value: string
  order?: number
}

type TextBlock = {
  type: 'text'
  value: string
}

type ParseDiagnostic = {
  line: number
  message: string
}

type ParseResult = {
  document: ResumeDocument
  diagnostics: ParseDiagnostic[]
}

type SourceCommandLine = {
  text: string
  line: number
}

type MeasuredBlock = {
  block: ResumeBlock
  height: number
}

type ResumePage = ResumeBlock[]

const SOURCE_STORAGE_KEY = 'resume-template-web:source:v2'
const PREVIOUS_SOURCE_STORAGE_KEY = 'resume-template-web:source:v1'
const LEGACY_DATA_KEY = 'resume-template-web:data:v1'
const PHOTO_STORAGE_KEY = 'resume-template-web:photo:v1'
const LOCAL_PHOTO_REFERENCE = 'local'
const LOCAL_PHOTO_COMMAND = `\\photo{${LOCAL_PHOTO_REFERENCE}}`
const PAGE_HEIGHT = 1122
const FLOW_PAGE_VERTICAL_PADDING = 98
const FIRST_PAGE_VERTICAL_PADDING = 96
const FIRST_PAGE_PHOTO_VERTICAL_PADDING = 75
const FIRST_PAGE_HEADER_HEIGHT = 112
const FIRST_PAGE_PHOTO_HEADER_HEIGHT = 105
const FLOW_PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - FLOW_PAGE_VERTICAL_PADDING
const BODY_LINE_HEIGHT = 21
const PROJECT_ENTRY_SPACING_HEIGHT = 7
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_WIDTH = 500
const PHOTO_HEIGHT = 700
const SAVE_DEBOUNCE_MS = 800

const sampleSource = String.raw`\resume{
  name=姓名,
  role=目标岗位,
  contact=电话：（+86） xxxxx | 邮箱：yourname@example.com
          籍贯：城市 | 链接：your-portfolio.example.com
}

\section{教育背景}
\entry{学校名称}{专业名称 · 学历}{开始时间-结束时间}
\field{学校标签}{如：985、211、双一流、重点实验室；没有可删除}
\field{奖项荣誉}{填写奖学金、竞赛奖项、学生工作或其他校园荣誉。}
\field{研究方向}{填写研究方向、主修方向或课程重点；没有可删除。}

\entry{学校名称}{专业名称 · 学历}{开始时间-结束时间}
\field{奖项荣誉}{填写 GPA、排名、奖项、证书或校内经历。}

\section{项目经历}
\entry{项目名称一}{}{项目时间}
\field{项目介绍}{填写项目背景、业务目标、个人职责和最终效果，建议用 1-2 句话说明。}
\field{工具方法}{按目标岗位填写软件、平台、方法、工具链或技术栈。}
\field{核心内容}{}
\bullet{职责贡献：填写你负责的模块、流程、交付物或协作内容，突出职责边界。}
\bullet{难点解决：填写关键问题、解决方案、验证方式或复盘沉淀。}
\bullet{结果产出：填写指标提升、上线成果、作品链接、奖项或团队认可。}

\entry{项目名称二}{}{项目时间}
\field{项目介绍}{填写第二个项目的背景、难点和你的主要贡献。}
\field{工具方法}{按实际使用填写，例如软件、平台、语言、框架、分析方法或协作流程。}
\field{核心内容}{}
\bullet{方案执行：填写关键任务、设计思路、数据分析、内容产出或功能实现。}
\bullet{问题定位：填写推进过程中遇到的问题，以及你的排查和解决过程。}
\bullet{结果沉淀：填写项目产出、复用能力、文档沉淀或指标提升。}

\section{实习/科研/竞赛经历}
\entry{经历名称}{角色或方向}{经历时间}
\field{经历介绍}{填写实习岗位、科研课题、竞赛项目或开源贡献的背景和职责。}
\field{工具方法}{按实际使用填写，例如软件、平台、语言、实验工具、设计方法或协作流程。}
\field{核心内容}{}
\bullet{职责贡献：填写你承担的任务、负责的模块或完成的实验/功能。}
\bullet{难点解决：填写关键问题、解决方案和验证方式。}
\bullet{成果产出：填写论文、专利、奖项、上线功能、性能指标或团队认可。}

\section{专业技能}
\field{专业能力}{填写与目标岗位相关的专业知识、业务理解、方法论或核心能力。}
\field{工具能力}{填写常用软件、平台、语言、框架、设计工具、分析工具或协作工具。}
\field{项目能力}{填写需求分析、方案设计、沟通协作、数据分析、交付落地等能力。}
\field{证书与语言}{填写英语等级、职业证书、竞赛证书、语言能力或其他证明材料。}
\field{其他}{填写英语等级、证书、开源贡献、博客、作品集或其他加分项。}
`

function App() {
  const [source, setSource] = useState(() => loadInitialSource())
  const [localPhoto, setLocalPhoto] = useState(() => loadStoredPhoto())
  const [photoError, setPhotoError] = useState('')
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isDraftLoading, setIsDraftLoading] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [authError, setAuthError] = useState('')
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const didLoadDraftRef = useRef(false)
  const skipNextSaveRef = useRef(true)
  const inlinePhotoMigration = useMemo(() => getInlinePhotoMigration(source), [source])
  const parseResult = useMemo(() => parseResumeSource(source, localPhoto), [source, localPhoto])
  const pages = useMemo(
    () => paginate(parseResult.document.blocks, Boolean(parseResult.document.meta.photo)),
    [parseResult.document.blocks, parseResult.document.meta.photo],
  )
  const hasPhotoCommand = useMemo(() => containsPhotoCommand(source), [source])

  useEffect(() => {
    let isMounted = true

    apiRequest<{ user: AuthUser }>('/api/auth/me')
      .then((data) => {
        if (isMounted) {
          setUser(data.user)
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!inlinePhotoMigration) {
      return
    }

    setLocalPhoto(inlinePhotoMigration.photo)
    setSource(inlinePhotoMigration.source)
  }, [inlinePhotoMigration])

  useEffect(() => {
    if (!localPhoto || !hasPhotoCommand || parseResult.document.meta.photo) {
      return
    }

    setSource((current) => upsertPhotoCommand(current))
  }, [hasPhotoCommand, localPhoto, parseResult.document.meta.photo])

  useEffect(() => {
    localStorage.setItem(SOURCE_STORAGE_KEY, source)
  }, [source])

  useEffect(() => {
    if (localPhoto) {
      localStorage.setItem(PHOTO_STORAGE_KEY, localPhoto)
      return
    }

    localStorage.removeItem(PHOTO_STORAGE_KEY)
  }, [localPhoto])

  useEffect(() => {
    if (!user || didLoadDraftRef.current) {
      return
    }

    let isMounted = true
    setIsDraftLoading(true)

    apiRequest<{ source: string | null; photo: string | null }>('/api/resume')
      .then(async (draft) => {
        if (!isMounted) {
          return
        }

        if (draft.source) {
          setSource(draft.source)
          setLocalPhoto(draft.photo ?? '')
          setSaveState('saved')
        } else {
          const importedSource = loadInitialSource()
          const importedPhoto = loadStoredPhoto()
          setSource(importedSource)
          setLocalPhoto(importedPhoto)
          setSaveState('saving')
          await saveResumeDraft(importedSource, importedPhoto)
          if (isMounted) {
            setSaveState('saved')
          }
        }
        skipNextSaveRef.current = false
        didLoadDraftRef.current = true
      })
      .catch(() => {
        if (isMounted) {
          setSaveState('error')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsDraftLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (!user || !didLoadDraftRef.current) {
      return
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    setSaveState('saving')
    const timeoutId = window.setTimeout(() => {
      saveResumeDraft(source, localPhoto)
        .then(() => {
          setSaveState('saved')
        })
        .catch(() => {
          setSaveState('error')
        })
    }, SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [source, localPhoto, user])

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('照片仅支持 JPG、PNG 或 WebP 格式')
      return
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('照片文件不能超过 5MB')
      return
    }

    try {
      const photo = await createResumePhotoDataUrl(file)
      setLocalPhoto(photo)
      setSource((current) => upsertPhotoCommand(current))
      setPhotoError('')
    } catch {
      setPhotoError('照片处理失败，请换一张清晰的一寸照')
    }
  }

  const removePhoto = () => {
    setLocalPhoto('')
    setSource((current) => removePhotoCommand(current))
    setPhotoError('')
  }

  const handleAuthenticated = (nextUser: AuthUser) => {
    setUser(nextUser)
    setAuthError('')
    didLoadDraftRef.current = false
    skipNextSaveRef.current = true
  }

  const logout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
    setSource(loadInitialSource())
    setLocalPhoto(loadStoredPhoto())
    didLoadDraftRef.current = false
    skipNextSaveRef.current = true
    setSaveState('idle')
  }

  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <AuthScreen error={authError} onError={setAuthError} onAuthenticated={handleAuthenticated} />
  }

  return (
    <main className="app-shell">
      <section className="editor-panel" aria-label="简历源码编辑区">
        <div className="editor-header">
          <div>
            <p className="eyebrow">Resume Source</p>
            <h1>LaTeX 风格简历编辑器</h1>
            <p className="user-line">当前用户：{user.username}</p>
          </div>
          <div className="header-actions" aria-label="编辑工具栏">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="photo-input"
              onChange={handlePhotoChange}
              ref={photoInputRef}
              type="file"
            />
            <div className="action-group" aria-label="照片">
              <button className="icon-button" type="button" onClick={() => photoInputRef.current?.click()}>
                <ImagePlus size={17} />
                <span>插入照片</span>
              </button>
              {hasPhotoCommand ? (
                <button className="icon-button icon-button--compact" type="button" onClick={removePhoto} aria-label="移除照片">
                  <X size={17} />
                </button>
              ) : null}
            </div>
            <div className="action-group" aria-label="模板">
              <button className="icon-button" type="button" onClick={() => setSource(sampleSource)}>
                <RotateCcw size={17} />
                <span>恢复示例</span>
              </button>
            </div>
            <div className="action-group" aria-label="导出">
              <button className="primary-button" type="button" onClick={() => window.print()}>
                <Printer size={18} />
                <span>导出 PDF</span>
              </button>
            </div>
            <div className="action-group" aria-label="账户">
              <button className="icon-button" type="button" onClick={logout}>
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </div>

        <section className="editor-workbench" aria-label="源码文件">
          <div className="editor-filebar">
            <div className="file-title">
              <FileText size={16} />
              <span>resume.tex</span>
            </div>
            <span className={`save-status save-status--${saveState}`}>
              {isDraftLoading ? '正在加载云端草稿' : getSaveStatusText(saveState)}
            </span>
          </div>

          <CodeEditor
            diagnostics={parseResult.diagnostics}
            value={source}
            onChange={setSource}
          />
        </section>

        {photoError ? <p className="photo-error">{photoError}</p> : null}

        <section className={`syntax-help ${isHelpOpen ? 'syntax-help--open' : ''}`}>
          <button className="syntax-help-toggle" type="button" onClick={() => setIsHelpOpen((value) => !value)}>
            <span>语法速查</span>
            <small>支持多行命令、照片和 A4 打印</small>
            <ChevronDown size={16} />
          </button>
          {isHelpOpen ? (
            <div className="syntax-help-body">
              <code>\resume{'{'} 可多行填写基础信息 {'}'}</code>
              <code>\photo{'{local}'}</code>
              <code>\section{'{章节标题}'}</code>
              <code>\entry{'{标题}{副标题}{时间}'}</code>
              <code>\field{'{标签}{内容}'}</code>
              <code>\bullet{'{要点内容}'}</code>
            </div>
          ) : null}
        </section>
      </section>

      <section className="preview-panel" aria-label="简历预览区">
        <div className="preview-toolbar">
          <div className="preview-title">
            <FileText size={18} />
            <span>A4 实时预览</span>
          </div>
          <div className="preview-meta">
            <span>{pages.length} 页</span>
            <span>按纸张宽度显示</span>
          </div>
          <button className="primary-button primary-button--small" type="button" onClick={() => window.print()}>
            <Printer size={17} />
            <span>导出 PDF</span>
          </button>
        </div>

        <div className="pages">
          {pages.map((page, index) => (
            <ResumePageView
              blocks={page}
              document={parseResult.document}
              key={`page-${index}`}
              showHeader={index === 0}
            />
          ))}
        </div>
      </section>
    </main>
  )
}

function AuthScreen({
  error,
  onError,
  onAuthenticated,
}: {
  error: string
  onError: (message: string) => void
  onAuthenticated: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    onError('')

    try {
      const data = await apiRequest<{ user: AuthUser }>(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      onAuthenticated(data.user)
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : '登录失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Resume Workspace</p>
        <h1>{mode === 'login' ? '登录简历工作台' : '注册简历工作台'}</h1>
        <p className="auth-copy">登录后源码、照片和草稿会保存到数据库，并按账号隔离。</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>用户名</span>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="至少 3 位，可用字母数字"
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            onError('')
            setMode((current) => (current === 'login' ? 'register' : 'login'))
          }}
        >
          {mode === 'login' ? '还没有账号？注册一个' : '已有账号？返回登录'}
        </button>
      </section>
    </main>
  )
}

function LoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-card--loading">
        <p className="eyebrow">Resume Workspace</p>
        <h1>正在加载</h1>
      </section>
    </main>
  )
}

function getSaveStatusText(saveState: 'idle' | 'saving' | 'saved' | 'error') {
  if (saveState === 'saving') {
    return '正在保存到数据库'
  }
  if (saveState === 'saved') {
    return '已保存到数据库'
  }
  if (saveState === 'error') {
    return '保存失败，请稍后重试'
  }
  return '等待保存'
}

async function apiRequest<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  })

  if (!response.ok) {
    let message = '请求失败'
    try {
      const data = (await response.json()) as { message?: string }
      message = data.message ?? message
    } catch {
      // Ignore invalid JSON error bodies.
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function saveResumeDraft(source: string, photo: string) {
  return apiRequest('/api/resume', {
    method: 'PUT',
    body: JSON.stringify({ source, photo: photo || null }),
  })
}

function CodeEditor({
  value,
  diagnostics,
  onChange,
}: {
  value: string
  diagnostics: ParseDiagnostic[]
  onChange: (value: string) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const diagnosticsRef = useRef(diagnostics)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    diagnosticsRef.current = diagnostics
  }, [diagnostics])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current) {
      return
    }

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      indentOnInput(),
      StreamLanguage.define(stex),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      lintGutter(),
      linter((view) =>
        diagnosticsRef.current.map((item) => {
          const line = view.state.doc.line(Math.min(item.line, view.state.doc.lines))
          return {
            from: line.from,
            to: line.to,
            severity: 'warning',
            message: item.message,
          }
        }),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
    ]

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: initialValueRef.current, extensions }),
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return <div className="code-editor" ref={hostRef} />
}

function ResumePageView({
  document,
  blocks,
  showHeader,
}: {
  document: ResumeDocument
  blocks: ResumeBlock[]
  showHeader: boolean
}) {
  const contactLine =
    document.meta.contact ||
    [
      document.meta.phone && `电话：${document.meta.phone}`,
      document.meta.email && `邮箱：${document.meta.email}`,
      document.meta.hometown && `籍贯：${document.meta.hometown}`,
      document.meta.link && `链接：${document.meta.link}`,
    ]
      .filter(Boolean)
      .join(' | ')

  return (
    <article
      className={`resume-page ${showHeader ? 'resume-page--first' : 'resume-page--flow'} ${
        showHeader && document.meta.photo ? 'resume-page--with-photo' : ''
      }`}
    >
      {showHeader ? (
        <header className={`resume-header ${document.meta.photo ? 'resume-header--with-photo' : ''}`}>
          <div className="resume-header-main">
            <h2>{document.meta.name || '姓名'}</h2>
            <p className="target">求职意向：{document.meta.role || '目标岗位'}</p>
            {contactLine ? <p className="contact">{renderResumeText(contactLine)}</p> : null}
          </div>
          {document.meta.photo ? (
            <img alt={`${document.meta.name || '求职者'}一寸照`} className="resume-photo" src={document.meta.photo} />
          ) : null}
        </header>
      ) : null}

      <div className="resume-content">
        {blocks.map((block, index) => (
          <ResumeBlockView block={block} key={`${block.type}-${index}`} />
        ))}
      </div>
    </article>
  )
}

function ResumeBlockView({ block }: { block: ResumeBlock }) {
  if (block.type === 'section') {
    return <h3 className="section-title">{block.title}</h3>
  }

  if (block.type === 'entry') {
    const schoolTag = block.fields.find(isSchoolTagField)
    const fields = block.fields.filter((field) => !isSchoolTagField(field))
    const blockClassName = ['entry-block']
    if (isProjectSection(block.sectionTitle) && (block.sectionEntryIndex ?? 0) > 0) {
      blockClassName.push('entry-block--project-spaced')
    }

    return (
      <section className={blockClassName.join(' ')}>
        <div className="entry-title">
          <div className="entry-title-main">
            <strong>{block.title}</strong>
            {schoolTag?.value ? (
              <span className="subtitle-part subtitle-part--highlight">{schoolTag.value}</span>
            ) : null}
            {splitSubtitle(block.subtitle).map((part, index) => (
              <span
                className={`subtitle-part ${isHighlightedSubtitle(part) ? 'subtitle-part--highlight' : ''}`}
                key={`${part}-${index}`}
              >
                {part}
              </span>
            ))}
          </div>
          {block.date ? <time>{block.date}</time> : null}
        </div>
        {fields.map((field, index) => (
          <ResumeBlockView block={field} key={`field-${index}`} />
        ))}
        {block.bullets.length > 0 ? (
          <ol className="bullet-list">
            {block.bullets.map((bullet, index) => (
              <li key={`bullet-${index}`}>{renderResumeText(bullet.value, { strongLead: true })}</li>
            ))}
          </ol>
        ) : null}
      </section>
    )
  }

  if (block.type === 'field') {
    return (
      <p className="field-line">
        <strong>{block.label}：</strong>
        {renderResumeText(block.value)}
      </p>
    )
  }

  if (block.type === 'bullet') {
    if (block.order) {
      return (
        <p className="loose-numbered-bullet">
          <span>{block.order}.</span>
          <span>{renderResumeText(block.value, { strongLead: true })}</span>
        </p>
      )
    }

    return <p className="loose-bullet">• {renderResumeText(block.value, { strongLead: true })}</p>
  }

  return <p className="text-line">{renderResumeText(block.value)}</p>
}

function isSchoolTagField(field: FieldBlock) {
  return ['学校标签', '院校标签', '学校层次'].includes(field.label)
}

function isProjectSection(sectionTitle: string | undefined) {
  return Boolean(sectionTitle && /项目/.test(sectionTitle))
}

function splitSubtitle(value: string) {
  return value
    .split(/[·|｜]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isHighlightedSubtitle(value: string) {
  return /(?:985|211|双一流|一本|重点)/.test(value)
}

function renderResumeText(value: string, options: { strongLead?: boolean } = {}) {
  const lines = normalizeManualLineBreaks(value)
  const nodes = lines.flatMap((line, index) => {
    const content = options.strongLead ? renderLeadStrong(line) : line
    if (index === 0) {
      return [content]
    }

    return [<br key={`break-${index}`} />, content]
  })

  return <>{nodes}</>
}

function normalizeManualLineBreaks(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
}

function renderLeadStrong(value: string) {
  const match = /^([^：:]{2,32}[：:])(.*)$/.exec(value)
  if (!match) {
    return value
  }

  return (
    <>
      <strong>{match[1]}</strong>
      {match[2]}
    </>
  )
}

async function createResumePhotoDataUrl(file: File) {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is not supported')
  }

  canvas.width = PHOTO_WIDTH
  canvas.height = PHOTO_HEIGHT

  const targetRatio = PHOTO_WIDTH / PHOTO_HEIGHT
  const sourceRatio = image.naturalWidth / image.naturalHeight
  let sourceWidth = image.naturalWidth
  let sourceHeight = image.naturalHeight
  let sourceX = 0
  let sourceY = 0

  if (sourceRatio > targetRatio) {
    sourceWidth = sourceHeight * targetRatio
    sourceX = (image.naturalWidth - sourceWidth) / 2
  } else {
    sourceHeight = sourceWidth / targetRatio
    sourceY = (image.naturalHeight - sourceHeight) / 2
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)

  URL.revokeObjectURL(image.src)
  return canvas.toDataURL('image/jpeg', 0.88)
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed'))
    }
    image.src = url
  })
}

function upsertPhotoCommand(source: string) {
  const lines = removePhotoCommand(source).split(/\r?\n/)
  const resumeEndIndex = findCommandEndLine(lines, 'resume')

  if (resumeEndIndex >= 0) {
    lines.splice(resumeEndIndex + 1, 0, LOCAL_PHOTO_COMMAND)
    return lines.join('\n')
  }

  return `${LOCAL_PHOTO_COMMAND}\n${lines.join('\n')}`
}

function removePhotoCommand(source: string) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('\\photo'))
    .join('\n')
}

function containsPhotoCommand(source: string) {
  return source.split(/\r?\n/).some((line) => line.trim().startsWith('\\photo'))
}

function findCommandEndLine(lines: string[], commandName: string) {
  const startIndex = lines.findIndex((line) => line.trim().startsWith(`\\${commandName}`))

  if (startIndex < 0) {
    return -1
  }

  let braceBalance = 0
  for (let index = startIndex; index < lines.length; index += 1) {
    braceBalance += countBraceBalance(lines[index])

    if (braceBalance <= 0) {
      return index
    }
  }

  return startIndex
}

function loadStoredPhoto() {
  return localStorage.getItem(PHOTO_STORAGE_KEY) ?? ''
}

function getInlinePhotoMigration(source: string) {
  const lines = source.split(/\r?\n/)
  const photoIndex = lines.findIndex((line) => line.trim().startsWith('\\photo'))

  if (photoIndex < 0) {
    return null
  }

  const command = parseCommand(lines[photoIndex].trim())
  const photo = command?.name === 'photo' ? command.args[0] : ''

  if (!isInlinePhotoDataUrl(photo)) {
    return null
  }

  lines[photoIndex] = LOCAL_PHOTO_COMMAND
  return {
    photo,
    source: lines.join('\n'),
  }
}

function isInlinePhotoDataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith('data:image/'))
}

function resolvePhotoReference(value: string, localPhoto: string) {
  if (value === LOCAL_PHOTO_REFERENCE) {
    return localPhoto
  }

  return value
}

function parseResumeSource(source: string, localPhoto: string): ParseResult {
  const document: ResumeDocument = {
    meta: {
      name: '',
      role: '',
      phone: '',
      email: '',
      hometown: '',
      link: '',
      contact: '',
      photo: '',
    },
    blocks: [],
  }
  const diagnostics: ParseDiagnostic[] = []
  let currentEntry: EntryBlock | null = null
  let currentSectionTitle = ''
  let currentSectionEntryIndex = 0

  collectSourceCommandLines(source, diagnostics).forEach(({ text, line: lineNumber }) => {
    const line = text.trim()

    if (!line || line.startsWith('%')) {
      return
    }

    const command = parseCommand(line)
    if (!command) {
      document.blocks.push({ type: 'text', value: line })
      return
    }

    switch (command.name) {
      case 'resume': {
        const meta = parseMeta(command.args[0] ?? '')
        document.meta = { ...document.meta, ...meta }
        currentEntry = null
        break
      }
      case 'photo': {
        const photo = command.args[0]
        if (!photo) {
          diagnostics.push({ line: lineNumber, message: '\\photo 需要 1 个参数' })
          return
        }
        const resolvedPhoto = resolvePhotoReference(photo, localPhoto)
        if (photo === LOCAL_PHOTO_REFERENCE && !resolvedPhoto) {
          diagnostics.push({ line: lineNumber, message: '\\photo{local} 未找到本地照片，请重新上传' })
          return
        }
        document.meta.photo = resolvedPhoto
        currentEntry = null
        break
      }
      case 'section': {
        const title = command.args[0]
        if (!title) {
          diagnostics.push({ line: lineNumber, message: '\\section 需要 1 个参数' })
          return
        }
        document.blocks.push({ type: 'section', title })
        currentSectionTitle = title
        currentSectionEntryIndex = 0
        currentEntry = null
        break
      }
      case 'entry': {
        if (command.args.length < 3) {
          diagnostics.push({ line: lineNumber, message: '\\entry 需要 3 个参数：标题、副标题、时间' })
        }
        const entry: EntryBlock = {
          type: 'entry',
          title: command.args[0] ?? '',
          subtitle: command.args[1] ?? '',
          date: command.args[2] ?? '',
          sectionTitle: currentSectionTitle,
          sectionEntryIndex: currentSectionEntryIndex,
          fields: [],
          bullets: [],
        }
        document.blocks.push(entry)
        currentEntry = entry
        currentSectionEntryIndex += 1
        break
      }
      case 'field': {
        if (command.args.length < 2) {
          diagnostics.push({ line: lineNumber, message: '\\field 需要 2 个参数：标签、内容' })
        }
        const field: FieldBlock = {
          type: 'field',
          label: command.args[0] ?? '',
          value: command.args[1] ?? '',
        }
        if (currentEntry) {
          currentEntry.fields.push(field)
        } else {
          document.blocks.push(field)
        }
        break
      }
      case 'bullet': {
        const value = command.args[0]
        if (!value) {
          diagnostics.push({ line: lineNumber, message: '\\bullet 需要 1 个参数' })
        }
        const bullet: BulletBlock = {
          type: 'bullet',
          value: value ?? '',
        }
        if (currentEntry) {
          currentEntry.bullets.push(bullet)
        } else {
          document.blocks.push(bullet)
        }
        break
      }
      default:
        diagnostics.push({ line: lineNumber, message: `未知命令：\\${command.name}` })
        document.blocks.push({ type: 'text', value: line })
        currentEntry = null
    }
  })

  return { document, diagnostics }
}

function collectSourceCommandLines(source: string, diagnostics: ParseDiagnostic[]) {
  const commands: SourceCommandLine[] = []
  const lines = source.split(/\r?\n/)
  let pending = ''
  let pendingLine = 0
  let braceBalance = 0

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1
    const trimmedLine = rawLine.trim()

    if (!pending && (!trimmedLine || trimmedLine.startsWith('%'))) {
      return
    }

    if (!pending && !trimmedLine.startsWith('\\')) {
      commands.push({ text: trimmedLine, line: lineNumber })
      return
    }

    if (!pending) {
      pending = rawLine
      pendingLine = lineNumber
      braceBalance = countBraceBalance(rawLine)
    } else {
      pending = `${pending}\n${rawLine}`
      braceBalance += countBraceBalance(rawLine)
    }

    if (braceBalance <= 0) {
      commands.push({ text: pending, line: pendingLine })
      pending = ''
      pendingLine = 0
      braceBalance = 0
    }
  })

  if (pending) {
    diagnostics.push({ line: pendingLine, message: '命令参数缺少右大括号 }' })
    commands.push({ text: pending, line: pendingLine })
  }

  return commands
}

function countBraceBalance(value: string) {
  let balance = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '{') {
      balance += 1
    } else if (char === '}') {
      balance -= 1
    }
  }

  return balance
}

function parseCommand(line: string): { name: string; args: string[] } | null {
  const match = /^\\([a-zA-Z]+)([\s\S]*)$/.exec(line)
  if (!match) {
    return null
  }

  return {
    name: match[1],
    args: parseBraceArgs(match[2]),
  }
}

function parseBraceArgs(input: string): string[] {
  const args: string[] = []
  let index = 0

  while (index < input.length) {
    while (/\s/.test(input[index] ?? '')) {
      index += 1
    }

    if (input[index] !== '{') {
      break
    }

    index += 1
    let depth = 1
    let value = ''

    while (index < input.length && depth > 0) {
      const char = input[index]
      if (char === '\\' && index + 1 < input.length) {
        value += input[index + 1]
        index += 2
        continue
      }
      if (char === '{') {
        depth += 1
        value += char
      } else if (char === '}') {
        depth -= 1
        if (depth > 0) {
          value += char
        }
      } else {
        value += char
      }
      index += 1
    }

    args.push(value.trim())
  }

  return args
}

function parseMeta(input: string) {
  const meta: Partial<ResumeDocument['meta']> = {}
  const normalizedInput = input.replace(/\r\n?/g, '\n')
  const pairs = normalizedInput
    .split(/,(?=\s*\w+\s*=)/)
    .map((item) => item.trim())
    .filter(Boolean)

  pairs.forEach((pair) => {
    const match = /^(\w+)\s*=\s*([\s\S]*)$/.exec(pair)
    if (!match) {
      return
    }

    const key = match[1] as keyof ResumeDocument['meta']
    if (key in { name: 1, role: 1, phone: 1, email: 1, hometown: 1, link: 1, contact: 1, photo: 1 }) {
      meta[key] = match[2].trim()
    }
  })

  return meta
}

function paginate(blocks: ResumeBlock[], hasPhoto: boolean): ResumePage[] {
  const pages: ResumePage[] = []
  let current: ResumePage = []
  let used = 0
  let pageIndex = 0

  for (const measured of blocks.flatMap(measureBlock)) {
    const limit = pageIndex === 0 ? getFirstPageContentHeight(hasPhoto) : FLOW_PAGE_CONTENT_HEIGHT

    if (current.length > 0 && used + measured.height > limit) {
      pages.push(current)
      current = []
      used = 0
      pageIndex += 1
    }

    current.push(measured.block)
    used += measured.height
  }

  if (current.length > 0 || pages.length === 0) {
    pages.push(current)
  }

  return pages
}

function getFirstPageContentHeight(hasPhoto: boolean) {
  const verticalPadding = hasPhoto ? FIRST_PAGE_PHOTO_VERTICAL_PADDING : FIRST_PAGE_VERTICAL_PADDING
  const headerHeight = hasPhoto ? FIRST_PAGE_PHOTO_HEADER_HEIGHT : FIRST_PAGE_HEADER_HEIGHT
  return PAGE_HEIGHT - verticalPadding - headerHeight
}

function measureBlock(block: ResumeBlock): MeasuredBlock[] {
  if (block.type === 'entry') {
    const fieldsToMeasure = block.fields.filter((field) => !isSchoolTagField(field))
    const projectSpacing =
      isProjectSection(block.sectionTitle) && (block.sectionEntryIndex ?? 0) > 0 ? PROJECT_ENTRY_SPACING_HEIGHT : 0
    const entryBase = 5 + projectSpacing + estimateLineCount(block.title + block.subtitle + block.date, 48) * BODY_LINE_HEIGHT
    const fields = fieldsToMeasure.map((field) => ({
      block: field,
      height: estimateManualLineCount(`${field.label}${field.value}`, 54) * BODY_LINE_HEIGHT,
    }))
    const bullets = block.bullets.map((bullet, index) => ({
      block: { type: 'bullet', value: bullet.value, order: index + 1 } satisfies BulletBlock,
      height: estimateManualLineCount(bullet.value, 50) * BODY_LINE_HEIGHT,
    }))

    if (entryBase + sumHeights(fields) + sumHeights(bullets) <= 320) {
      return [{ block, height: entryBase + sumHeights(fields) + sumHeights(bullets) }]
    }

    return [
      { block: { ...block, fields: [], bullets: [] }, height: entryBase },
      ...fields,
      ...bullets,
    ]
  }

  if (block.type === 'section') {
    return [{ block, height: 36 }]
  }

  if (block.type === 'field') {
    return [{ block, height: estimateManualLineCount(`${block.label}${block.value}`, 54) * BODY_LINE_HEIGHT }]
  }

  if (block.type === 'bullet') {
    return [{ block, height: estimateManualLineCount(block.value, 50) * BODY_LINE_HEIGHT }]
  }

  return [{ block, height: estimateManualLineCount(block.value, 58) * BODY_LINE_HEIGHT }]
}

function sumHeights(items: MeasuredBlock[]) {
  return items.reduce((total, item) => total + item.height, 0)
}

function estimateLineCount(value: string, charsPerLine: number) {
  return Math.max(1, Math.ceil(value.length / charsPerLine))
}

function estimateManualLineCount(value: string, charsPerLine: number) {
  return normalizeManualLineBreaks(value).reduce(
    (total, line) => total + estimateLineCount(line, charsPerLine),
    0,
  )
}

function loadInitialSource() {
  const savedSource = localStorage.getItem(SOURCE_STORAGE_KEY)
  if (savedSource) {
    return savedSource
  }

  const previousSource = localStorage.getItem(PREVIOUS_SOURCE_STORAGE_KEY)
  if (previousSource && previousSource !== sampleSource) {
    localStorage.setItem(SOURCE_STORAGE_KEY, previousSource)
    return previousSource
  }

  const legacy = localStorage.getItem(LEGACY_DATA_KEY)
  if (legacy) {
    localStorage.setItem(SOURCE_STORAGE_KEY, sampleSource)
    return sampleSource
  }

  return sampleSource
}

export default App

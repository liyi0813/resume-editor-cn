import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'
import { z } from 'zod'

type UserSession = {
  id: number
  username: string
}

type AuthenticatedRequest = Request & {
  user: UserSession
}

type DbUser = {
  id: number
  username: string
  password_hash: string
}

type DbDraft = {
  source_text: string
  photo_data_url: string | null
  updated_at: Date
}

const PORT = Number(process.env.PORT ?? 3000)
const DB_HOST = process.env.DB_HOST ?? 'mysql'
const DB_PORT = Number(process.env.DB_PORT ?? 3306)
const DB_NAME = process.env.DB_NAME ?? 'resume_template'
const DB_USER = process.env.DB_USER ?? 'resume'
const DB_PASSWORD = process.env.DB_PASSWORD ?? ''
const JWT_SECRET = process.env.JWT_SECRET ?? ''
const COOKIE_NAME = process.env.COOKIE_NAME ?? 'resume_session'
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
const COOKIE_MAX_AGE_MS = Number(process.env.COOKIE_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000)
const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS ?? 200_000)
const MAX_PHOTO_CHARS = Number(process.env.MAX_PHOTO_CHARS ?? 1_500_000)
const DB_STARTUP_ATTEMPTS = Number(process.env.DB_STARTUP_ATTEMPTS ?? 60)
const DB_STARTUP_DELAY_MS = Number(process.env.DB_STARTUP_DELAY_MS ?? 2000)

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long')
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 8),
  namedPlaceholders: true,
  charset: 'utf8mb4',
})

const authSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_@.-]+$/),
  password: z.string().min(6).max(128),
})

const resumeSchema = z.object({
  source: z.string().max(MAX_SOURCE_CHARS),
  photo: z.string().max(MAX_PHOTO_CHARS).nullable().optional(),
})

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '3mb' }))
app.use(cookieParser())

app.get('/api/health', (_request, response) => {
  response.type('text/plain').send('ok\n')
})

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const input = authSchema.parse(request.body)
    const passwordHash = await bcrypt.hash(input.password, 12)

    try {
      const [result] = await pool.execute<mysql.ResultSetHeader>(
        'INSERT INTO users (username, password_hash) VALUES (:username, :passwordHash)',
        { username: input.username, passwordHash },
      )
      const user = { id: result.insertId, username: input.username }
      setSessionCookie(response, user)
      response.status(201).json({ user })
    } catch (error) {
      if (isDuplicateEntry(error)) {
        response.status(409).json({ message: '用户名已存在' })
        return
      }
      throw error
    }
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const input = authSchema.parse(request.body)
    const user = await findUserByUsername(input.username)

    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      response.status(401).json({ message: '用户名或密码错误' })
      return
    }

    const session = { id: user.id, username: user.username }
    setSessionCookie(response, session)
    response.json({ user: session })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', (_request, response) => {
  clearSessionCookie(response)
  response.status(204).end()
})

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: getRequestUser(request) })
})

app.get('/api/resume', requireAuth, async (request, response, next) => {
  try {
    const user = getRequestUser(request)
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT source_text, photo_data_url, updated_at FROM resume_drafts WHERE user_id = :userId LIMIT 1',
      { userId: user.id },
    )
    const draft = rows[0] as DbDraft | undefined

    response.json({
      source: draft?.source_text ?? null,
      photo: draft?.photo_data_url ?? null,
      updatedAt: draft?.updated_at ?? null,
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/resume', requireAuth, async (request, response, next) => {
  try {
    const user = getRequestUser(request)
    const input = resumeSchema.parse(request.body)
    await pool.execute(
      `
        INSERT INTO resume_drafts (user_id, source_text, photo_data_url)
        VALUES (:userId, :source, :photo)
        ON DUPLICATE KEY UPDATE
          source_text = VALUES(source_text),
          photo_data_url = VALUES(photo_data_url),
          updated_at = CURRENT_TIMESTAMP
      `,
      {
        userId: user.id,
        source: input.source,
        photo: input.photo ?? null,
      },
    )
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  const handledNext = next
  void handledNext

  if (error instanceof z.ZodError) {
    response.status(400).json({ message: '请求参数不合法' })
    return
  }

  console.error(error)
  response.status(500).json({ message: '服务暂时不可用' })
})

async function findUserByUsername(username: string) {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT id, username, password_hash FROM users WHERE username = :username LIMIT 1',
    { username },
  )
  return rows[0] as DbUser | undefined
}

function getRequestUser(request: Request) {
  return (request as AuthenticatedRequest).user
}

function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const token = request.cookies?.[COOKIE_NAME]

  if (!token || typeof token !== 'string') {
    response.status(401).json({ message: '请先登录' })
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as UserSession
    ;(request as AuthenticatedRequest).user = {
      id: payload.id,
      username: payload.username,
    }
    next()
  } catch {
    clearSessionCookie(response)
    response.status(401).json({ message: '登录已过期，请重新登录' })
  }
}

function setSessionCookie(response: Response, user: UserSession) {
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: Math.floor(COOKIE_MAX_AGE_MS / 1000) })
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  })
}

function clearSessionCookie(response: Response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  })
}

function isDuplicateEntry(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY')
}

await start()

async function start() {
  await waitForDatabase()
  await migrate()

  app.listen(PORT, () => {
    console.log(`resume-template-api listening on ${PORT}`)
  })
}

async function waitForDatabase() {
  let lastError: unknown

  for (let attempt = 1; attempt <= DB_STARTUP_ATTEMPTS; attempt += 1) {
    try {
      const connection = await pool.getConnection()
      connection.release()
      return
    } catch (error) {
      lastError = error
      console.warn(
        `Waiting for database ${DB_HOST}:${DB_PORT} (${attempt}/${DB_STARTUP_ATTEMPTS})`,
      )
      await sleep(DB_STARTUP_DELAY_MS)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Database did not become available before startup timeout')
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resume_drafts (
      user_id BIGINT UNSIGNED NOT NULL,
      source_text MEDIUMTEXT NOT NULL,
      photo_data_url MEDIUMTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_resume_drafts_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

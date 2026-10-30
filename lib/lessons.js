/**
 * Durable lesson store behind the self-iterating optimization skill.
 *
 * Lessons are plugin-owned data, not session state: they must outlive every
 * session, project and restart, and they must be readable synchronously while a
 * plugin registers its skill. A small JSON file under the profile directory is
 * the whole mechanism — no session event is appended, so an older reader can
 * always reopen the log.
 *
 * This bundle keeps its own directory (`prompt-optimize`) so it never fights the
 * prompt-document bundle over one store: two capabilities, two lesson sets, two
 * mirrors.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/** Categories a lesson can be filed under; the skill groups lessons by these. */
export const LESSON_CATEGORIES = [
  'structure',
  'wording',
  'context',
  'constraint',
  'acceptance',
  'format',
  'tooling',
  'other',
]

/** Human labels for the categories, used in the composed skill section. */
const CATEGORY_LABELS = {
  structure: '七块结构',
  wording: '用词与语气',
  context: '上下文与数据源',
  constraint: '硬性约束',
  acceptance: '验收标准',
  format: '输出格式',
  tooling: '工具与流程',
  other: '其它',
}

/**
 * Where plugin-owned optimize data lives when the config names no path.
 *
 * Measured on the sibling bundle with a diagnostic probe: the Host process
 * carries no `DSH_*` variable at all, so the homedir fallback is what actually
 * runs here. The profile branches stay as declarations of intent for a launcher
 * that does export them — and they are what makes this module testable, since a
 * test can point `DSH_PROFILE_DIR` at a scratch directory.
 */
export function defaultLibraryDir() {
  const env = process.env
  const home = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== ''
    ? env.DSH_HOME.trim()
    : path.join(os.homedir(), '.dsh')
  if (typeof env.DSH_PROFILE_DIR === 'string' && env.DSH_PROFILE_DIR.trim() !== '') {
    return path.join(env.DSH_PROFILE_DIR.trim(), 'prompt-optimize')
  }
  if (typeof env.DSH_PROFILE === 'string' && env.DSH_PROFILE.trim() !== '') {
    return path.join(home, 'profiles', env.DSH_PROFILE.trim(), 'prompt-optimize')
  }
  return path.join(home, 'prompt-optimize')
}

/** Durable, append-mostly list of lessons plus a human-readable mirror. */
export class LessonsStore {
  constructor(directory) {
    this.directory = directory
    this.file = path.join(directory, 'lessons.json')
    this.mirror = path.join(directory, 'prompt-optimization-best-practices.md')
    this.problem = undefined
  }

  /** Read every lesson, newest last. A missing file is an empty store. */
  readSync() {
    try {
      if (!existsSync(this.file)) return []
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return Array.isArray(parsed?.lessons) ? parsed.lessons : []
    }
    catch (error) {
      // A corrupt store must never take the plugin down: report it through the
      // skill body instead of throwing during apply().
      this.problem = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  /** Append one lesson and return the stored record. */
  add({ lesson, category, evidence }) {
    const body = String(lesson ?? '').trim()
    if (body === '') throw new Error('prompt_tune_learn needs a non-empty `lesson`')
    const lessons = this.readSync()
    const record = {
      id: `T${String(lessons.length + 1).padStart(3, '0')}`,
      at: new Date().toISOString(),
      category: LESSON_CATEGORIES.includes(category) ? category : 'other',
      lesson: body,
      ...(String(evidence ?? '').trim() === '' ? {} : { evidence: String(evidence).trim() }),
    }
    const next = [...lessons, record]
    mkdirSync(this.directory, { recursive: true })
    writeFileSync(this.file, `${JSON.stringify({ version: 1, lessons: next }, null, 2)}\n`, 'utf8')
    return { record, total: next.length, file: this.file }
  }

  /** Mirror the composed skill body beside the store so a human can read it. */
  writeMirror(content) {
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(this.mirror, content, 'utf8')
      return this.mirror
    }
    catch {
      return undefined
    }
  }
}

/**
 * Render the lessons section appended to the skill body.
 *
 * @param lessons Stored lesson records, oldest first.
 * @param problem Store read failure to surface instead of hiding it.
 * @returns Markdown section, including its own heading.
 */
export function composeLessonsSection(lessons, problem) {
  const heading = '## 已积累的经验教训（本段由 dsh-prompt-optimize 自动迭代，请勿手工重排）'
  const lines = [heading, '']
  if (problem !== undefined) {
    lines.push(`> ⚠️ 教训库读取失败，本段可能不完整：${problem}`, '')
  }
  if (lessons.length === 0) {
    lines.push('> 共 0 条。每次改写后把「哪里差点翻车」用 `prompt_tune_learn` 记一条，下一次任何会话加载本 skill 时都会读到。', '')
    lines.push('（还没有积累到教训。第一份草稿被人工修过之后，就来记第一条。）', '')
    return lines.join('\n')
  }
  lines.push(`> 共 ${lessons.length} 条。每次用 \`prompt_tune_learn\` 记一条，下一次任何会话加载本 skill 时都会读到。`, '')
  const byCategory = new Map()
  for (const lesson of lessons) {
    const key = LESSON_CATEGORIES.includes(lesson.category) ? lesson.category : 'other'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(lesson)
  }
  for (const [key, group] of byCategory) {
    lines.push(`### ${CATEGORY_LABELS[key] ?? key}`, '')
    for (const lesson of group) {
      lines.push(`- **${lesson.id}** ${lesson.lesson}`)
      if (lesson.evidence !== undefined) lines.push(`  - 依据：${lesson.evidence}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

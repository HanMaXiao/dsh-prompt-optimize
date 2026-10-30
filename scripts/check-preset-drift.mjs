/**
 * Preset drift guard for the 「提示词优化」 agent preset.
 *
 * Contract: the `plugins` list of this package's `preset-prompt-tune` row is a
 * verbatim copy of the shipped `standard` preset's `plugins` list, followed by
 * this package's own policy row. When DSH changes its `standard` preset, the
 * copy goes stale and the preset mode keeps a tool set the shipped mode no
 * longer has — silently, because a preset row that still resolves still
 * activates. This script diffs the two blocks and exits non-zero on drift.
 *
 * The package must not gain a dependency, so there is no YAML library: both
 * files are read as line blocks and only the `plugins:` sequence of one named
 * row is extracted, a shape the two files share. Line endings and trailing
 * whitespace are normalized; every other byte is compared verbatim.
 *
 * The DSH source root comes from `--dsh-root` or `DSH_SOURCE_ROOT`. With
 * neither configured the check prints a SKIP notice and exits 0: a bare
 * checkout has nothing to compare against, and that is not a failure.
 *
 * Exit codes: 0 = no drift or SKIP, 1 = drift, 2 = the configured root does not
 * hold the expected preset file, or the command line is wrong.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_PATCH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const PRESET_ROW_ID = 'preset-prompt-tune'
const SHIPPED_ROW_ID = 'preset-standard'
const SHIPPED_PRESET_REL = path.join('packages', 'bundle', 'web-app', 'presets', 'standard.patch.yml')
const LOCAL_PREFIX = '@local/'
const CONTEXT_LINES = 3

const USAGE = 'usage: node scripts/check-preset-drift.mjs [--dsh-root <DSH source root>]'

function fail(code, message) {
  console.error(message)
  process.exitCode = code
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function indentOf(line) {
  return /^[ \t]*/.exec(line)[0].length
}

/** Strips one layer of YAML quoting from a scalar. */
function unquote(text) {
  const match = /^(['"])(.*)\1$/.exec(text)
  return match ? match[2] : text
}

/**
 * Reads a file as normalized lines. Trailing whitespace is dropped so an
 * editor that trims on save cannot manufacture drift inside the copied block.
 */
function readLines(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.replace(/\s+$/, ''))
}

/**
 * Extracts the `plugins:` sequence of one `- id: <rowId>` row, or null when the
 * row or the sequence is not there.
 *
 * The shape assumed for both files is the one they actually share: rows are
 * list items of `- insert:`, their own keys sit two columns right of the dash,
 * and `plugins:` is nested somewhere under them (under `config:` in both
 * files). The first `plugins:` line deeper than the row and before the next
 * sibling row is the one. A blank line never ends the block, because the copied
 * block scalars (`section: |`) contain blank lines of their own; a non-blank
 * line at or left of the `plugins:` indent does.
 */
function extractRow(file, rowId) {
  const lines = readLines(file)
  const rowPattern = new RegExp(`^([ \\t]*)-[ \\t]+id:[ \\t]*${escapeRegExp(rowId)}[ \\t]*$`)
  let itemIndent = -1
  let rowLine = -1
  for (let index = 0; index < lines.length; index++) {
    const match = rowPattern.exec(lines[index])
    if (match) {
      itemIndent = match[1].length
      rowLine = index + 1
      break
    }
  }
  if (rowLine < 0) return null

  const sibling = new RegExp(`^[ \\t]{${itemIndent}}-[ \\t]`)
  const plugins = /^([ \t]+)plugins:[ \t]*$/
  let pluginsIndent = -1
  let pluginsLine = -1
  for (let index = rowLine; index < lines.length; index++) {
    if (index > rowLine && sibling.test(lines[index])) break
    const match = plugins.exec(lines[index])
    if (match && match[1].length > itemIndent) {
      pluginsIndent = match[1].length
      pluginsLine = index + 1
      break
    }
  }
  if (pluginsLine < 0) return null

  const entries = []
  for (let index = pluginsLine; index < lines.length; index++) {
    const line = lines[index]
    if (line === '') continue
    if (indentOf(line) <= pluginsIndent) break
    entries.push({ number: index + 1, text: line })
  }
  while (entries.length > 0 && entries[entries.length - 1].text === '') entries.pop()
  if (entries.length === 0) return null
  const pluginIndent = indentOf(entries[0].text)
  const itemStart = new RegExp(`^[ \\t]{${pluginIndent}}-[ \\t]`)
  const items = []
  for (const entry of entries) {
    if (itemStart.test(entry.text)) {
      items.push({ id: '?', name: '', startLine: entry.number, lines: [] })
    }
    if (items.length > 0) items[items.length - 1].lines.push(entry.text)
  }
  for (const item of items) {
    const id = /^[ \t]*-[ \t]+id:[ \t]*(\S+)/.exec(item.lines[0])
    const name = new RegExp(`^[ \\t]{${pluginIndent + 2}}name:[ \\t]*(.*)$`, 'm').exec(item.lines.join('\n'))
    item.id = id ? id[1] : '?'
    item.name = name ? unquote(name[1].trim()) : ''
  }

  return {
    file,
    rowId,
    rowLine,
    startLine: pluginsLine,
    endLine: entries.length > 0 ? entries[entries.length - 1].number : pluginsLine,
    entries,
    items,
  }
}

function isLocalAppend(item) {
  return item.name.startsWith(LOCAL_PREFIX)
}

/** Line-based LCS diff over entries, so reported numbers stay the file's own. */
function diffOps(a, b) {
  const rows = a.length
  const cols = b.length
  const table = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1))
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = a[i].text === b[j].text
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (a[i].text === b[j].text) {
      ops.push({ kind: ' ', a: a[i], b: b[j] })
      i++
      j++
    }
    else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: '-', a: a[i], b: null })
      i++
    }
    else {
      ops.push({ kind: '+', a: null, b: b[j] })
      j++
    }
  }
  while (i < rows) ops.push({ kind: '-', a: a[i++], b: null })
  while (j < cols) ops.push({ kind: '+', a: null, b: b[j++] })
  return ops
}

function formatDiff(a, b, aName, bName) {
  const ops = diffOps(a, b)
  const changed = []
  ops.forEach((op, index) => {
    if (op.kind !== ' ') changed.push(index)
  })
  if (changed.length === 0) return ''

  const groups = []
  let group = [changed[0]]
  for (const index of changed.slice(1)) {
    if (index - group[group.length - 1] <= CONTEXT_LINES * 2 + 1) group.push(index)
    else {
      groups.push(group)
      group = [index]
    }
  }
  groups.push(group)

  const nearest = (from, side) => {
    for (let index = from; index >= 0; index--) {
      if (ops[index][side]) return ops[index][side].number
    }
    return 0
  }

  const out = [`--- ${aName}`, `+++ ${bName}`]
  for (const hunk of groups) {
    const from = Math.max(0, hunk[0] - CONTEXT_LINES)
    const to = Math.min(ops.length - 1, hunk[hunk.length - 1] + CONTEXT_LINES)
    let aStart = 0
    let bStart = 0
    let aCount = 0
    let bCount = 0
    for (let index = from; index <= to; index++) {
      const op = ops[index]
      if (op.a) {
        if (aCount === 0) aStart = op.a.number
        aCount++
      }
      if (op.b) {
        if (bCount === 0) bStart = op.b.number
        bCount++
      }
    }
    if (aCount === 0) aStart = nearest(from - 1, 'a')
    if (bCount === 0) bStart = nearest(from - 1, 'b')
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`)
    for (let index = from; index <= to; index++) {
      const op = ops[index]
      out.push(`${op.kind}${op.a ? op.a.text : op.b.text}`)
    }
  }
  return `${out.join('\n')}\n`
}

/** Returns null once the command line is rejected, so no further work runs. */
function parseArgs(argv) {
  const options = { dshRoot: null, help: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--dsh-root') {
      index++
      if (index >= argv.length) {
        fail(2, `--dsh-root needs a value\n${USAGE}`)
        return null
      }
      options.dshRoot = argv[index]
    }
    else if (arg.startsWith('--dsh-root=')) options.dshRoot = arg.slice('--dsh-root='.length)
    else {
      fail(2, `unknown argument: ${arg}\n${USAGE}`)
      return null
    }
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  if (options.help) {
    console.log(`${USAGE}\n\nCompares this package's \`${PRESET_ROW_ID}\` preset row against the\nshipped \`standard\` preset in the DSH source tree. The root can also come\nfrom DSH_SOURCE_ROOT; without it the check SKIPs and exits 0.`)
    return
  }

  const root = [options.dshRoot, process.env.DSH_SOURCE_ROOT].find(value => value && value.trim() !== '')
  if (!root) {
    console.log('SKIP: no DSH source root configured, so there is nothing to compare against.')
    console.log(`  hint: node scripts/check-preset-drift.mjs --dsh-root <DSH source root>`)
    console.log(`        (or set DSH_SOURCE_ROOT, e.g. D:\\XiaoProject\\deepseek-harness)`)
    return
  }

  const resolved = path.resolve(root.trim())
  const shippedFile = path.join(resolved, SHIPPED_PRESET_REL)
  if (!existsSync(shippedFile)) {
    fail(2, `DSH source root does not contain ${SHIPPED_PRESET_REL}: ${resolved}\nPoint --dsh-root at a DSH source tree that holds packages/bundle/web-app/presets/.`)
    return
  }

  const mine = extractRow(PACKAGE_PATCH, PRESET_ROW_ID)
  if (!mine) {
    fail(2, `row \`${PRESET_ROW_ID}\` or its \`plugins:\` list is missing from ${PACKAGE_PATCH}`)
    return
  }
  const shipped = extractRow(shippedFile, SHIPPED_ROW_ID)
  if (!shipped) {
    fail(2, `row \`${SHIPPED_ROW_ID}\` or its \`plugins:\` list is missing from ${shippedFile}`)
    return
  }

  const appends = mine.items.filter(isLocalAppend)
  const copied = mine.items.slice(0, mine.items.length - appends.length)
  const copyEnd = copied.length === 0
    ? mine.startLine - 1
    : copied[copied.length - 1].startLine + copied[copied.length - 1].lines.length - 1
  const copy = mine.entries.filter(entry => entry.number <= copyEnd)

  const shippedById = new Map(shipped.items.map(item => [item.id, item]))
  const copyById = new Map(copied.map(item => [item.id, item]))

  const missing = shipped.items.filter(item => !copyById.has(item.id)).map(item => item.id)
  const extra = [...copyById.keys()].filter(id => !shippedById.has(id))
  const differing = shipped.items
    .filter(item => copyById.has(item.id) && copyById.get(item.id).lines.join('\n') !== item.lines.join('\n'))
    .map(item => item.id)
  const reordered = missing.length === 0 && extra.length === 0
    && JSON.stringify(copied.map(item => item.id)) !== JSON.stringify(shipped.items.map(item => item.id))

  console.log(`preset drift: \`${PRESET_ROW_ID}\` (cordis.patch.yml) vs the shipped \`${SHIPPED_ROW_ID}\` preset`)
  console.log(`  copy    : ${mine.file}:${mine.startLine}-${mine.endLine} (${mine.items.length} rows, ${appends.length} local append)`)
  console.log(`  shipped : ${shipped.file}:${shipped.startLine}-${shipped.endLine} (${shipped.items.length} rows)`)
  for (const append of appends) {
    console.log(`  appended: ${append.id} -> ${append.name} (this package's own row, expected)`)
  }

  const problems = []
  if (missing.length > 0) problems.push(`missing from the copy: ${missing.join(', ')}`)
  if (extra.length > 0) problems.push(`unexpected in the copy: ${extra.join(', ')}`)
  if (differing.length > 0) problems.push(`differs: ${differing.join(', ')}`)
  if (reordered) problems.push('same rows in a different order')

  if (problems.length === 0) {
    console.log(`OK: no drift, ${shipped.items.length} of ${shipped.items.length} shipped rows match verbatim`)
    return
  }

  console.log('')
  for (const problem of problems) console.log(`DRIFT: ${problem}`)
  const diff = formatDiff(copy, shipped.entries, `${mine.file} (${PRESET_ROW_ID})`, `${shipped.file} (${SHIPPED_ROW_ID})`)
  if (diff !== '') {
    console.log('')
    console.log('(- is this package\'s copy, + is what the shipped preset declares)')
    console.log(diff.trimEnd())
  }
  console.log('')
  console.log(`Refresh \`${PRESET_ROW_ID}\`'s plugins list from the shipped preset, then re-append the policy row.`)
  fail(1, `preset drift: ${problems.length} difference(s) against ${shipped.file}`)
}

main()

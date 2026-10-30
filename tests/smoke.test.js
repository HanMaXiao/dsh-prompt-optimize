/**
 * Packaging contract smoke test.
 *
 * The bundle is imported straight off disk by the Loader, so the cheapest
 * regression that matters is "everything `package.json` promises is actually
 * in the tree, the manifest is owned by this package, and the manifest agrees
 * with the service about the one method it publishes". A missing file fails
 * as an install that succeeds and then refuses to mount, which is a much
 * worse bug report than a refused install.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'))

describe('package contract', () => {
  it('every exports target exists on disk', () => {
    for (const [key, target] of Object.entries(pkg.exports ?? {})) {
      if (typeof target !== 'string') continue
      if (target.includes('*')) {
        const dir = path.join(PACKAGE_DIR, target.split('*')[0])
        assert.ok(existsSync(dir), `exports["${key}"] globs a missing directory: ${target}`)
        continue
      }
      assert.ok(existsSync(path.join(PACKAGE_DIR, target)), `exports["${key}"] points at a missing file: ${target}`)
    }
  })
})

describe('typert manifest', () => {
  it('is owned by this package and describes the published method', async () => {
    const { TYPERT } = await import('../typert.js')
    assert.equal(TYPERT.package, pkg.name)
    assert.ok(Array.isArray(TYPERT.invocations) && TYPERT.invocations.length > 0)
    for (const invocation of TYPERT.invocations) {
      assert.equal(typeof invocation.method, 'string')
      assert.equal(invocation.implementation, invocation.method)
      assert.ok(Array.isArray(invocation.parameters))
      assert.equal(typeof invocation.result?.create, 'function', 'the loader requires a create() factory on every codec')
    }
  })

  it('the service publishes exactly the methods the manifest describes', async () => {
    const { TYPERT } = await import('../typert.js')
    const source = readFileSync(path.join(PACKAGE_DIR, 'remote.js'), 'utf8')
    const roster = [...source.matchAll(/\{\s*method:\s*'([A-Za-z]+)'/g)].map(match => match[1])
    assert.deepEqual([...new Set(roster)].sort(), TYPERT.invocations.map(entry => entry.method).sort())
  })
})

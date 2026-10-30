/**
 * The client's seven-block mirror must stay in lockstep with `lib/tune.js`.
 *
 * `client.js` cannot import a sibling module from the browser module table, so
 * it carries its own copy of the block patterns for the coverage line. A looser
 * copy there once reported blocks the Host analyzer had stopped accepting, so
 * this test holds the two together: every pattern the Host ships must appear
 * verbatim, in the same order, in the client's mirror. It reads `client.js` as
 * text because the assertion is about the source's shape, the same way
 * `dsh-hub`'s bridge test reads its client.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKS } from '../lib/tune.js'

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientSource = readFileSync(path.join(PACKAGE_DIR, 'client.js'), 'utf8')

describe('client pattern mirror', () => {
  it('carries the Host patterns verbatim, in the Host order', () => {
    const mirror = clientSource.slice(
      clientSource.indexOf('const BLOCKS = ['),
      clientSource.indexOf('/* Which blocks the draft already carries. */'),
    )
    let cursor = 0
    for (const block of BLOCKS) {
      const title = mirror.indexOf(`'${block.title}'`, cursor)
      assert.ok(title !== -1, `the client mirror lost block "${block.title}"`)
      const pattern = mirror.indexOf(String(block.match), title)
      assert.ok(pattern !== -1, `the client mirror's "${block.title}" pattern drifted from lib/tune.js`)
      cursor = pattern + String(block.match).length
    }
  })

  it('carries no pattern the Host does not ship', () => {
    const mirror = clientSource.slice(
      clientSource.indexOf('const BLOCKS = ['),
      clientSource.indexOf('/* Which blocks the draft already carries. */'),
    )
    const clientPatterns = [...mirror.matchAll(/match:\s*(\/(?:[^\/\\\n]|\\.|\\.)+\/[a-z]*)/g)].map(match => match[1])
    const hostPatterns = BLOCKS.map(block => String(block.match))
    assert.deepEqual(clientPatterns, hostPatterns)
  })
})

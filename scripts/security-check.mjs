import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/shares/server/security.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText
const { randomId, randomSlug, tokenHash, hashPin, checkPin } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const slugSource = await readFile(
  new URL('../src/features/shares/slug.ts', import.meta.url),
  'utf8',
)
const slugCompiled = ts.transpileModule(slugSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText
const { isValidCustomSlug, isValidSlug } = await import(
  `data:text/javascript;base64,${Buffer.from(slugCompiled).toString('base64')}`
)

assert.match(randomId(), /^[A-Za-z0-9_-]{12}$/)
assert.match(randomSlug(), /^[a-z]{11}$/)
assert.equal(isValidCustomSlug('abc'), true)
assert.equal(isValidCustomSlug('my-link-9'), true)
assert.equal(isValidCustomSlug('api'), false)
assert.equal(isValidCustomSlug('ab'), false)
assert.equal(isValidCustomSlug('-abc'), false)
assert.equal(isValidCustomSlug('a'.repeat(31)), false)
assert.equal(isValidSlug('abc'), true)
assert.equal(isValidSlug(randomSlug()), true)
assert.equal(isValidSlug('AbCdEfGhIjKl'), true)
assert.notEqual(tokenHash('first'), tokenHash('second'))
const stored = hashPin('1234')
assert.equal(checkPin('1234', stored), true)
assert.equal(checkPin('4321', stored), false)

console.log('Security checks passed')

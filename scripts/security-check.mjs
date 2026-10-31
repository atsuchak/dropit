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

assert.match(randomId(), /^[A-Za-z0-9_-]{12}$/)
assert.match(randomSlug(), /^[a-z]{11}$/)
assert.notEqual(tokenHash('first'), tokenHash('second'))
const stored = hashPin('1234')
assert.equal(checkPin('1234', stored), true)
assert.equal(checkPin('4321', stored), false)

console.log('Security checks passed')

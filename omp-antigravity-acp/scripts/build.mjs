#!/usr/bin/env node
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = resolve(root, '..', 'node_modules/typescript/bin/tsc')
const check = process.argv.includes('--check')
if (!check) rmSync(resolve(root, 'lib'), { recursive: true, force: true })
const result = spawnSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json'), ...(check ? ['--noEmit'] : [])], { stdio: 'inherit' })
process.exit(result.status ?? 1)

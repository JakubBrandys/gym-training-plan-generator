import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const hooksDir = path.dirname(fileURLToPath(import.meta.url))
const realRoot = path.resolve(hooksDir, '../..')
const realNpx = execFileSync('which', ['npx'], { encoding: 'utf8' }).trim()
const realBash = execFileSync('which', ['bash'], { encoding: 'utf8' }).trim()

const BACKEND_CONFIGS = ['tsconfig.json', '.oxlintrc.json', 'vitest.config.ts', 'vitest.config.e2e.ts']
const FRONTEND_CONFIGS = [
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  '.oxlintrc.json',
]

const SOURCES = {
  'backend/src/ok.ts': 'export const add = (a: number, b: number): number => a + b\n',
  'backend/src/ok.spec.ts':
    "import { add } from './ok.js'\n\nit('adds', () => {\n  expect(add(1, 2)).toBe(3)\n})\n",
  'backend/test/ok.e2e-spec.ts': "it('e2e passes', () => {\n  expect(1).toBe(1)\n})\n\nexport {}\n",
  'frontend/src/ok.ts': 'export const add = (a: number, b: number): number => a + b\n',
  'frontend/src/ok.spec.ts':
    "import { expect, it } from 'vitest'\nimport { add } from './ok.ts'\n\nit('adds', () => {\n  expect(add(1, 2)).toBe(3)\n})\n",
  'frontend/src/Clean.tsx': 'export const Clean = () => <p>ok</p>\n',
}

const FLOATING_PROMISE = 'const work = async (): Promise<void> => {}\nwork()\nexport {}\n'
const CONDITIONAL_HOOK = [
  "import { useState } from 'react'",
  '',
  'export const Broken = ({ on }: { on: boolean }) => {',
  '  if (on) {',
  '    const [n] = useState(0)',
  '    return <p>{n}</p>',
  '  }',
  '  return null',
  '}',
  '',
].join('\n')
const TYPE_ERROR = "export const n: number = 'x'\n"
const PLAIN_BROKEN = 'export const broken = (: \n'

const put = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), content)
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const linkModules = (packageDir, omitBins = []) => {
  const realModules = path.join(realRoot, path.basename(packageDir), 'node_modules')
  const target = path.join(packageDir, 'node_modules')
  fs.mkdirSync(path.join(target, '.bin'), { recursive: true })
  for (const entry of fs.readdirSync(realModules)) {
    if (!entry.startsWith('.')) fs.symlinkSync(path.join(realModules, entry), path.join(target, entry))
  }
  const realBin = path.join(realModules, '.bin')
  for (const bin of fs.readdirSync(realBin)) {
    if (!omitBins.includes(bin)) {
      fs.symlinkSync(fs.realpathSync(path.join(realBin, bin)), path.join(target, '.bin', bin))
    }
  }
}

const track = (t, dir) => {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const createFixture = (t, { omitBins = [] } = {}) => {
  const root = track(t, fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-'))))
  git(root, 'init', '-q', '-b', 'main')
  put(root, '.gitignore', 'node_modules/\n*.tsbuildinfo\n')
  for (const script of fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'))) {
    const dest = path.join(root, '.claude/hooks', script)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(hooksDir, script), dest)
    fs.chmodSync(dest, 0o755)
  }
  fs.copyFileSync(path.join(realRoot, '.claude/settings.json'), path.join(root, '.claude/settings.json'))
  for (const [pkg, configs] of [
    ['backend', BACKEND_CONFIGS],
    ['frontend', FRONTEND_CONFIGS],
  ]) {
    put(root, `${pkg}/package.json`, '{ "type": "module" }\n')
    for (const config of configs) {
      fs.copyFileSync(path.join(realRoot, pkg, config), path.join(root, pkg, config))
    }
    linkModules(path.join(root, pkg), omitBins)
  }
  for (const [rel, content] of Object.entries(SOURCES)) put(root, rel, content)
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'fixture')
  return root
}

const stubNpx = (t) => {
  const dir = track(t, fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-npx-')))
  const log = path.join(dir, 'npx.log')
  fs.writeFileSync(
    path.join(dir, 'npx'),
    `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "${log}"\nexec "${realNpx}" "$@"\n`,
    { mode: 0o755 },
  )
  return {
    dir,
    calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  }
}

const hook = (t, root, script, payload, { cwd = root, env = {}, command } = {}) => {
  const registry = track(t, fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-reg-')))
  const baseEnv = { ...process.env, TMPDIR: registry, AGENT_HOOKS_TEST: '' }
  delete baseEnv.CLAUDE_PROJECT_DIR
  delete baseEnv.NODE_TEST_CONTEXT
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const options = { cwd, input, encoding: 'utf8', env: { ...baseEnv, ...env } }
  return command
    ? spawnSync('sh', ['-c', command], options)
    : spawnSync(path.join(root, '.claude/hooks', script), [], options)
}

const detail = (r) => `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`

const assertBlocked = (r, ...patterns) => {
  assert.equal(r.status, 2, detail(r))
  for (const pattern of patterns) assert.match(r.stderr, pattern, detail(r))
}

const assertSilentPass = (r) => {
  assert.equal(r.status, 0, detail(r))
  assert.equal(r.stderr, '', detail(r))
  assert.equal(r.stdout, '', detail(r))
}

const edit = (root, rel, extra = {}) => ({
  tool_name: 'Edit',
  cwd: root,
  session_id: 'sess-edit',
  tool_input: { file_path: path.isAbsolute(rel) ? rel : path.join(root, rel) },
  ...extra,
})

const stop = (root, extra = {}) => ({ cwd: root, session_id: 'sess-stop', stop_hook_active: false, ...extra })

const PER_EDIT_SCRIPTS = ['lint-edited-file.sh', 'related-tests.sh']

describe('lint-edited-file.sh', () => {
  test('blocks a floating promise in a backend file and names the file and rule', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    assertBlocked(
      hook(t, root, 'lint-edited-file.sh', edit(root, 'backend/src/floating.ts')),
      /backend\/src\/floating\.ts/,
      /no-floating-promises/,
    )
  })

  test('blocks a conditional hook in a frontend file and names the file and rule', (t) => {
    const root = createFixture(t)
    put(root, 'frontend/src/Broken.tsx', CONDITIONAL_HOOK)
    assertBlocked(
      hook(t, root, 'lint-edited-file.sh', edit(root, 'frontend/src/Broken.tsx')),
      /frontend\/src\/Broken\.tsx/,
      /rules-of-hooks/,
    )
  })

  test('blocks a syntax error', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/broken.ts', PLAIN_BROKEN)
    assertBlocked(hook(t, root, 'lint-edited-file.sh', edit(root, 'backend/src/broken.ts')), /backend\/src\/broken\.ts/)
  })

  test('passes silently on clean files in both packages', (t) => {
    const root = createFixture(t)
    assertSilentPass(hook(t, root, 'lint-edited-file.sh', edit(root, 'backend/src/ok.ts')))
    assertSilentPass(hook(t, root, 'lint-edited-file.sh', edit(root, 'frontend/src/Clean.tsx')))
  })

  test('skips uncovered types, files outside both packages and nonexistent files', (t) => {
    const root = createFixture(t)
    put(root, 'backend/README.md', '# x\n')
    put(root, 'backend/package.json', '{ "type": "module" }\n')
    put(root, 'notes.ts', FLOATING_PROMISE)
    for (const rel of ['backend/README.md', 'backend/package.json', 'notes.ts', 'backend/src/missing.ts']) {
      assertSilentPass(hook(t, root, 'lint-edited-file.sh', edit(root, rel)))
    }
  })
})

describe('related-tests.sh', () => {
  test('blocks a behavioural failure in a backend module and names the spec', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => a + b + 1\n')
    assertBlocked(
      hook(t, root, 'related-tests.sh', edit(root, 'backend/src/ok.ts')),
      /backend\/src\/ok\.ts/,
      /ok\.spec\.ts/,
    )
  })

  test('blocks a behavioural failure in a frontend module and names the spec', (t) => {
    const root = createFixture(t)
    put(root, 'frontend/src/ok.ts', 'export const add = (a: number, b: number): number => a + b + 1\n')
    assertBlocked(
      hook(t, root, 'related-tests.sh', edit(root, 'frontend/src/ok.ts')),
      /frontend\/src\/ok\.ts/,
      /ok\.spec\.ts/,
    )
  })

  test('passes on clean files and on files no test depends on', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    assertSilentPass(hook(t, root, 'related-tests.sh', edit(root, 'backend/src/ok.ts')))
    assertSilentPass(hook(t, root, 'related-tests.sh', edit(root, 'frontend/src/ok.ts')))
    assertSilentPass(hook(t, root, 'related-tests.sh', edit(root, 'backend/src/floating.ts')))
  })
})

describe('payload shapes', () => {
  const payloads = {
    'empty object': {},
    'not json': 'not json',
    'empty stdin': '',
    'tool call without a path': { tool_name: 'Bash', cwd: '/', tool_input: { command: 'ls' } },
    'notebook edit': { tool_name: 'NotebookEdit', cwd: '/', tool_input: { notebook_path: '/nope/x.ipynb' } },
  }
  for (const script of PER_EDIT_SCRIPTS) {
    for (const [name, payload] of Object.entries(payloads)) {
      test(`${script} passes on ${name}`, (t) => {
        const root = createFixture(t)
        assertSilentPass(hook(t, root, script, payload))
      })
    }
  }

  test('end-of-turn.sh passes on an unparseable payload when nothing changed', (t) => {
    const root = createFixture(t)
    assertSilentPass(hook(t, root, 'end-of-turn.sh', 'not json'))
  })

  test('end-of-turn.sh falls back to the process cwd when the payload has none', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    assertBlocked(hook(t, root, 'end-of-turn.sh', { stop_hook_active: false }), /floating\.ts/)
  })
})

describe('end-of-turn.sh', () => {
  test('with no changes it passes without running any check', (t) => {
    const root = createFixture(t)
    const npx = stubNpx(t)
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env: { PATH: `${npx.dir}:${process.env.PATH}` } }))
    assert.deepEqual(npx.calls(), [])
  })

  test('markdown-only changes run no check', (t) => {
    const root = createFixture(t)
    const npx = stubNpx(t)
    put(root, 'backend/README.md', '# changed\n')
    put(root, 'context/notes.md', '# new\n')
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env: { PATH: `${npx.dir}:${process.env.PATH}` } }))
    assert.deepEqual(npx.calls(), [])
  })

  test('a clean change passes and the sweep really ran lint, tests and typecheck in both packages', (t) => {
    const root = createFixture(t)
    const npx = stubNpx(t)
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    put(root, 'frontend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env: { PATH: `${npx.dir}:${process.env.PATH}` } }))
    const calls = npx.calls().join('\n')
    for (const pkg of ['backend', 'frontend']) {
      assert.match(calls, new RegExp(`${pkg}\\|--no-install oxlint`))
      assert.match(calls, new RegExp(`${pkg}\\|--no-install vitest run`))
      assert.match(calls, new RegExp(`${pkg}\\|--no-install tsc`))
    }
    assert.match(calls, /backend\|--no-install vitest run --config \.\/vitest\.config\.e2e\.ts/)
  })

  test('a frontend-only change never touches the backend', (t) => {
    const root = createFixture(t)
    const npx = stubNpx(t)
    put(root, 'frontend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env: { PATH: `${npx.dir}:${process.env.PATH}` } }))
    assert.ok(npx.calls().length > 0)
    for (const call of npx.calls()) assert.ok(call.startsWith(`${root}/frontend|`), call)
  })

  test('a lint error written straight to disk, bypassing the per-edit hook, blocks and names the file', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /oxlint errors in changed backend files/, /floating\.ts/)
  })

  test('the same lint error written to a frontend file blocks', (t) => {
    const root = createFixture(t)
    put(root, 'frontend/src/Broken.tsx', CONDITIONAL_HOOK)
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /oxlint errors in changed frontend files/, /Broken\.tsx/)
  })

  test('a type error that tests cannot see blocks in both packages', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/typeerr.ts', TYPE_ERROR)
    put(root, 'frontend/src/typeerr.ts', TYPE_ERROR)
    assertBlocked(
      hook(t, root, 'end-of-turn.sh', stop(root)),
      /backend typecheck fails/,
      /frontend typecheck fails/,
      /error TS2322/,
    )
  })

  test('a red test in a module the turn only imported blocks', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => a + b + 1\n')
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /backend unit tests fail/, /ok\.spec\.ts/)
  })

  test('a failing backend e2e spec blocks', (t) => {
    const root = createFixture(t)
    put(root, 'backend/test/ok.e2e-spec.ts', "it('e2e fails', () => {\n  expect(1).toBe(2)\n})\n\nexport {}\n")
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /backend e2e tests fail/, /ok\.e2e-spec\.ts/)
  })

  test('reports every failure in one message', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    put(root, 'frontend/src/typeerr.ts', TYPE_ERROR)
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /oxlint errors in changed backend files/, /frontend typecheck fails/)
  })

  test('lets the agent finish once the retry flag is set, even with errors present', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root, { stop_hook_active: true })))
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root, { loop_count: 1 })))
  })

  test('changes under the hooks dir run the hook proof test, and the guard prevents recursion', (t) => {
    const root = createFixture(t)
    put(root, '.claude/hooks/lint-edited-file.sh', fs.readFileSync(path.join(hooksDir, 'lint-edited-file.sh'), 'utf8') + '\n')
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /Hook proof test fails/)
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env: { AGENT_HOOKS_TEST: '1' } }))
  })
})

describe('checkout resolution', () => {
  test('CLAUDE_PROJECT_DIR pointing at a checkout with an error does not leak into the session checkout', (t) => {
    const root = createFixture(t)
    const other = createFixture(t)
    put(other, 'backend/src/floating.ts', FLOATING_PROMISE)
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    const env = { CLAUDE_PROJECT_DIR: other }
    assertSilentPass(hook(t, root, 'lint-edited-file.sh', edit(root, 'backend/src/ok.ts'), { env }))
    assertSilentPass(hook(t, root, 'related-tests.sh', edit(root, 'backend/src/ok.ts'), { env }))
    assertSilentPass(hook(t, root, 'end-of-turn.sh', stop(root), { env }))
  })

  test('a relative path resolves against the payload cwd', (t) => {
    const root = createFixture(t)
    put(root, 'backend/src/floating.ts', FLOATING_PROMISE)
    const relative = { tool_name: 'Edit', cwd: root, tool_input: { file_path: 'backend/src/floating.ts' } }
    assertBlocked(hook(t, root, 'lint-edited-file.sh', relative), /floating\.ts/)
    const fromSubdir = { tool_name: 'Edit', cwd: path.join(root, 'backend'), tool_input: { file_path: 'src/floating.ts' } }
    assertBlocked(hook(t, root, 'lint-edited-file.sh', fromSubdir, { cwd: path.join(root, 'backend') }), /floating\.ts/)
  })

  test('a broken file of another repository is skipped', (t) => {
    const root = createFixture(t)
    const foreign = track(t, fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-foreign-'))))
    git(foreign, 'init', '-q', '-b', 'main')
    put(foreign, 'backend/src/floating.ts', FLOATING_PROMISE)
    for (const script of PER_EDIT_SCRIPTS) {
      assertSilentPass(hook(t, root, script, edit(root, path.join(foreign, 'backend/src/floating.ts'))))
    }
  })

  test('an edit in a sibling worktree is checked there and swept at end of turn', (t) => {
    const root = createFixture(t)
    const worktree = track(t, path.join(fs.realpathSync(os.tmpdir()), `agent-hooks-wt-${process.pid}-${Date.now()}`))
    git(root, 'worktree', 'add', '-q', worktree, '-b', 'sibling')
    linkModules(path.join(worktree, 'backend'))
    linkModules(path.join(worktree, 'frontend'))
    put(worktree, 'backend/src/floating.ts', FLOATING_PROMISE)
    const payload = edit(root, path.join(worktree, 'backend/src/floating.ts'), { session_id: 'sess-wt' })
    const registry = track(t, fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-reg-')))
    const env = { TMPDIR: registry }
    assertBlocked(
      hook(t, root, 'lint-edited-file.sh', payload, { env }),
      /backend\/src\/floating\.ts/,
      /no-floating-promises/,
    )
    const swept = hook(t, root, 'end-of-turn.sh', { cwd: root, session_id: 'sess-wt', stop_hook_active: false }, { env })
    assertBlocked(swept, /oxlint errors in changed backend files/, /floating\.ts/)
    assert.ok(swept.stderr.includes(worktree), detail(swept))
  })

  test('every configured command reaches an executable script from a worktree with a stale project dir', (t) => {
    const root = createFixture(t)
    const worktree = track(t, path.join(fs.realpathSync(os.tmpdir()), `agent-hooks-cmd-${process.pid}-${Date.now()}`))
    git(root, 'worktree', 'add', '-q', worktree, '-b', 'commands')
    const settings = JSON.parse(fs.readFileSync(path.join(worktree, '.claude/settings.json'), 'utf8'))
    const commands = Object.values(settings.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)))
    assert.equal(commands.length, 3)
    for (const command of commands) {
      const r = hook(t, worktree, null, {}, { cwd: worktree, env: { CLAUDE_PROJECT_DIR: '/nonexistent/stale' }, command })
      assert.equal(r.status, 0, `${command}\n${detail(r)}`)
    }
  })
})

describe('no silent success', () => {
  test('a missing jq fails every script visibly', (t) => {
    const root = createFixture(t)
    const bin = track(t, fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hooks-bin-')))
    fs.symlinkSync(realBash, path.join(bin, 'bash'))
    fs.symlinkSync('/usr/bin/env', path.join(bin, 'env'))
    for (const script of [...PER_EDIT_SCRIPTS, 'end-of-turn.sh']) {
      assertBlocked(hook(t, root, script, edit(root, 'backend/src/ok.ts'), { env: { PATH: bin } }), /needs jq/)
    }
  })

  test('a missing linter fails the per-edit lint and the end-of-turn sweep', (t) => {
    const root = createFixture(t, { omitBins: ['oxlint'] })
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    assertBlocked(hook(t, root, 'lint-edited-file.sh', edit(root, 'backend/src/ok.ts')), /oxlint/)
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /oxlint errors in changed backend files/)
  })

  test('a missing typechecker fails the end-of-turn sweep', (t) => {
    const root = createFixture(t, { omitBins: ['tsc'] })
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /backend typecheck fails/)
  })

  test('a missing test runner fails the per-edit tests and the end-of-turn sweep', (t) => {
    const root = createFixture(t, { omitBins: ['vitest'] })
    put(root, 'backend/src/ok.ts', 'export const add = (a: number, b: number): number => b + a\n')
    assertBlocked(hook(t, root, 'related-tests.sh', edit(root, 'backend/src/ok.ts')), /Tests related to backend\/src\/ok\.ts fail/)
    assertBlocked(hook(t, root, 'end-of-turn.sh', stop(root)), /backend unit tests fail/)
  })
})

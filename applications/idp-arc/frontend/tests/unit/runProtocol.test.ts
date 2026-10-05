// The Scenario 1 run (core/use-cases/runProtocol.ts) against in-memory ports. Run: yarn test:unit
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRunProtocolUseCase } from '../../src/core/use-cases/runProtocol'
import { RUN_SETTINGS } from '../../src/core/runSettings'
import type { IWorkspaceApi, ImportResourceInput, StartRunInput, WorkspaceResourceState } from '../../src/core/ports/IWorkspaceApi'
import type { IObjectStore } from '../../src/core/ports/IObjectStore'
import type { RunState } from '../../src/core/types'

beforeEach(() => {
  RUN_SETTINGS.importPollMs = 1
  RUN_SETTINGS.runPollMs = 1
})

const FOUR_CHOICE = {
  id: 'four-choice-reversal',
  name: 'Four-choice reversal digging task',
  repoZipUrl: 'https://codeload.github.com/maracbaylis/four-choice-example/zip/refs/heads/main',
  notebooksDir: 'notebooks',
  inputDir: 'example_data',
  inputFormats: ['.xlsx', '.zip'],
}
const auth = { getToken: async () => 'token', tokenParsed: { sub: 'user-1' } }
const file = () => new File(['x'], 'animal_01.xlsx')

function fakes(opts: { runPhases?: string[]; importPolls?: number; failUpload?: boolean; resources?: WorkspaceResourceState[][] } = {}) {
  const calls: string[] = []
  const imports: ImportResourceInput[] = []
  let runInput: StartRunInput | undefined
  let polls = 0
  const phases = [...(opts.runPhases ?? ['Pending', 'Running', 'Succeeded'])]
  const api: IWorkspaceApi = {
    async listWorkspaces() { return [] },
    async createWorkspace(_t, name, tags) { calls.push(`create:${name}:${tags?.join(',')}`); return 42 },
    async getWorkspaceResources() {
      polls += 1
      if (opts.resources) return opts.resources[Math.min(polls - 1, opts.resources.length - 1)]
      if (polls <= (opts.importPolls ?? 2)) return [{ id: -1, name: 'Importing resources into workspace' }]
      // What OSB's scan lists once the repository is in: its notebooks.
      const repo = imports.find((i) => i.resourceType === 'g')
      return repo ? [{ id: 7, name: '01_load.ipynb', status: 'a', path: `${repo.folder}/${repo.name}/notebooks/01_load.ipynb` }] : []
    },
    async importResource(_t, input) { calls.push(`import:${input.resourceType}`); imports.push(input) },
    async startRun(_t, ws, input) { calls.push(`run:${ws}`); runInput = input; return { workflow: 'osb-run-notebooks-job-1', outputDir: `${input.outputDir}/run-${input.name}-2026-10-05T04-01-12Z` } },
    async getRun() { return { phase: (phases.length > 1 ? phases.shift() : phases[0]) as 'Pending' } },
  }
  const store: IObjectStore = {
    async put(input) {
      calls.push('upload')
      if (opts.failUpload) throw new Error('403 Forbidden')
      return { url: `https://storage.googleapis.com/maabcd/uploads/${input.protocolId}/${input.userSub}/u/${input.file.name}`, key: 'k' }
    },
  }
  return { api, store, calls, imports, runInput: () => runInput }
}

async function run(f: ReturnType<typeof fakes>, input: Partial<Parameters<ReturnType<typeof createRunProtocolUseCase>>[0]> = {}) {
  const states: RunState[] = []
  await createRunProtocolUseCase(auth, f.api, f.store)(
    { protocol: FOUR_CHOICE, file: file(), workspaceName: 'Four-choice', ...input }, (s) => states.push(s))
  return states
}

test('uploads, imports both into the run folder, waits, runs, and reports the results folder', async () => {
  const f = fakes()
  const states = await run(f)
  const last = states[states.length - 1]

  assert.equal(last.phase, 'succeeded', last.error)
  assert.equal(last.workspaceId, 42)
  assert.equal(last.outputsDir, 'results/run-four-choice-reversal-2026-10-05T04-01-12Z')
  assert.deepEqual(last.steps.map((s) => s.state), Array(6).fill('succeeded'))
  assert.ok(f.calls.includes('create:Four-choice:maabcd:four-choice-reversal'))

  const [repo, data] = f.imports
  const folder = repo.folder.replace(/\/repo$/, '')
  assert.match(folder, /^idp\/[0-9a-f-]{36}$/)
  assert.deepEqual(repo, { workspaceId: 42, name: 'four-choice-example-main', url: FOUR_CHOICE.repoZipUrl, folder: `${folder}/repo`, resourceType: 'g' })
  assert.equal(data.folder, `${folder}/data`)
  assert.equal(data.resourceType, 'e')
  assert.match(data.url, /^https:\/\/storage\.googleapis\.com\/maabcd\/uploads\/four-choice-reversal\/user-1\//)

  assert.deepEqual(f.runInput(), {
    notebooksDir: `${folder}/repo/four-choice-example-main/notebooks`,
    inputPath: `${folder}/data`, inputDir: 'example_data', outputDir: 'results', name: 'four-choice-reversal',
  })
})

test('the upload lands before anything is created in OSB; then repo import, data import, run', async () => {
  const f = fakes()
  await run(f)
  const order = (c: string) => f.calls.findIndex((x) => x.startsWith(c))
  assert.ok(order('upload') < order('create'))
  assert.ok(order('create') < order('import:g'))
  assert.ok(order('import:g') < order('import:e'))
  assert.ok(order('import:e') < order('run'))
})

test('a failed upload creates no workspace and imports nothing', async () => {
  const f = fakes({ failUpload: true })
  await run(f)
  assert.deepEqual(f.calls, ['upload'])
})

test('an existing workspace is reused, not created', async () => {
  const f = fakes()
  const states = await run(f, { workspaceId: 7 })
  assert.ok(!f.calls.some((c) => c.startsWith('create')))
  assert.ok(f.calls.includes('run:7'))
  assert.equal(states[states.length - 1].phase, 'succeeded')
})

test('without a file: no upload, no data import, the notebooks run on the example data', async () => {
  const f = fakes()
  const states = await run(f, { file: null })
  const last = states[states.length - 1]
  assert.equal(last.phase, 'succeeded')
  assert.deepEqual(f.imports.map((i) => i.resourceType), ['g'])
  assert.equal(f.runInput()?.inputPath, undefined)
  assert.deepEqual(last.steps.filter((s) => s.state === 'skipped').map((s) => s.id), ['upload', 'data'])
})

test('a failed upload marks only the upload step failed', async () => {
  const states = await run(fakes({ failUpload: true }))
  const last = states[states.length - 1]
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /403/)
  assert.deepEqual(last.steps.filter((s) => s.state === 'failed').map((s) => s.id), ['upload'])
})

test('a failed run reports the failed notebook', async () => {
  const f = fakes({ runPhases: ['Running', 'Failed'] })
  f.api.getRun = async () => ({ phase: 'Failed', message: '02_qc.ipynb failed; see results/x/notebooks/02_qc.ipynb' })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /02_qc\.ipynb failed/)
  assert.equal(last.steps.find((s) => s.id === 'run')?.state, 'failed')
})

test('an import OSB marks as failed stops the run', async () => {
  const f = fakes({ resources: [[{ id: 3, name: 'animal_01.xlsx', status: 'e' }]] })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /could not import animal_01\.xlsx/)
  assert.ok(!f.calls.some((c) => c.startsWith('run')))
})

test('imports that leave no notebooks in the notebooks folder stop the run', async () => {
  const f = fakes({ resources: [[{ id: 7, name: '01_load.ipynb', status: 'a', path: 'elsewhere/notebooks/01_load.ipynb' }]] })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /No notebooks in idp\/.+\/notebooks\/ after the import/)
  assert.equal(last.steps.find((s) => s.id === 'imports')?.state, 'failed')
  assert.ok(!f.calls.some((c) => c.startsWith('run')))
})

test('a file the protocol cannot read fails before anything is uploaded or created', async () => {
  const f = fakes()
  const last = (await run(f, { file: new File(['x'], 'notes.txt') })).pop()!
  assert.equal(last.phase, 'failed')
  assert.deepEqual(f.calls, [])
})

test('an upload for a protocol without an input folder fails before anything moves', async () => {
  const f = fakes()
  const last = (await run(f, { protocol: { ...FOUR_CHOICE, inputDir: undefined } })).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /no input folder configured yet/)
  assert.deepEqual(f.calls, [])
})

test('a protocol without a repository fails clearly', async () => {
  const f = fakes()
  const last = (await run(f, { protocol: { id: 'open-field', name: 'Open field task' } })).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /no analysis repository configured yet/)
})

test('a failed repository import marks the repository step', async () => {
  const f = fakes()
  f.api.importResource = async () => { throw new Error('500 MalformedModelDictionaryError') }
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.deepEqual(last.steps.filter((s) => s.state === 'failed').map((s) => s.id), ['repo'])
  assert.equal(last.steps.find((s) => s.id === 'upload')?.state, 'succeeded')
})

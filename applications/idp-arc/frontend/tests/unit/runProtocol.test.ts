// The Scenario 1 run (core/use-cases/runProtocol.ts) against in-memory ports. Run: yarn test:unit
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRunProtocolUseCase } from '../../src/core/use-cases/runProtocol'
import { RUN_SETTINGS } from '../../src/core/runSettings'
import type { IWorkspaceApi, ImportResourceInput, StartRunInput, WorkspaceResourceState } from '../../src/core/ports/IWorkspaceApi'
import type { IObjectStore } from '../../src/core/ports/IObjectStore'
import type { RunState } from '../../src/core/types'

beforeEach(() => {
  RUN_SETTINGS.runResultTimeoutMs = 20
  RUN_SETTINGS.runStartTimeoutMs = 2 * 60_000
  RUN_SETTINGS.importPollMs = 1
  RUN_SETTINGS.runPollMs = 1
  RUN_SETTINGS.runStartTimeoutMs = 20
  RUN_SETTINGS.runTimeoutMs = 70 * 60_000
})

const FOUR_CHOICE = {
  id: 'four-choice-reversal',
  name: 'Four-choice reversal digging task',
  repoZipUrl: 'https://codeload.github.com/maracbaylis/four-choice-example/zip/refs/heads/main',
  notebooksDir: 'notebooks',
  inputFormats: ['.xlsx', '.zip'],
}
const auth = { getToken: async () => 'token', tokenParsed: { sub: 'user-1' } }
const file = () => new File(['x'], 'animal_01.xlsx')

/**
 * `runPolls`: how many polls after the run is submitted show OSB's placeholder (its workflow running).
 * `runFails`: `notebook`, a notebook fails (its executed notebooks listed in notebooks.failed/);
 * `setup`, the run stops before any notebook (nothing listed).
 */
function fakes(opts: { runPolls?: number; importPolls?: number; failUpload?: boolean; resources?: WorkspaceResourceState[][]; runFails?: 'notebook' | 'setup' } = {}) {
  const calls: string[] = []
  const imports: ImportResourceInput[] = []
  let runInput: StartRunInput | undefined
  let polls = 0
  let runPollsLeft = 0
  const api: IWorkspaceApi = {
    async listWorkspaces() { return [] },
    async createWorkspace(_t, name, tags) { calls.push(`create:${name}:${tags?.join(',')}`); return 42 },
    async getWorkspaceResources() {
      if (runPollsLeft > 0) { runPollsLeft -= 1; return [{ id: -1, name: 'Refreshing resources' }] }
      polls += 1
      if (opts.resources) return opts.resources[Math.min(polls - 1, opts.resources.length - 1)]
      if (polls <= (opts.importPolls ?? 2)) return [{ id: -1, name: 'Importing resources into workspace' }]
      // What OSB's scan lists once the repository is in: its notebooks; after a successful run, the
      // executed ones too; after a failed one, in notebooks.failed/ (its workflow scans either way).
      const repo = imports.find((i) => i.resourceType === 'g')
      const listed: WorkspaceResourceState[] = repo ? [{ id: 7, name: '01_load.ipynb', status: 'a', path: `${repo.folder}/${repo.name}/notebooks/01_load.ipynb` }] : []
      if (runInput && !opts.runFails) {
        for (const nb of runInput.notebooks) listed.push({ id: 8, name: nb, status: 'a', path: `${runInput.results.notebooks}/${nb.split('/').pop()}` })
      }
      if (runInput && opts.runFails === 'notebook') {
        for (const nb of runInput.notebooks) listed.push({ id: 9, name: nb, status: 'a', path: `${runInput.results.notebooks}.failed/${nb.split('/').pop()}` })
      }
      return listed
    },
    async importResource(_t, input) { calls.push(`import:${input.resourceType}`); imports.push(input) },
    async startRun(_t, ws, input) {
      calls.push(`run:${ws}`); runInput = input; runPollsLeft = opts.runPolls ?? 2
      return { workflow: 'osb-run-notebooks-job-1' }
    },
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

test('uploads, imports both into the run folder, waits, runs, and reports the run folder', async () => {
  const f = fakes()
  const states = await run(f)
  const last = states[states.length - 1]

  assert.equal(last.phase, 'succeeded', last.error)
  assert.equal(last.workspaceId, 42)
  assert.deepEqual(last.steps.map((s) => s.state), Array(6).fill('succeeded'))
  assert.ok(f.calls.includes('create:Four-choice:maabcd:four-choice-reversal'))

  // <protocol>/run-<protocol>-<UTC time>/: the code and the upload, imported into the run's folder.
  const [repo, data] = f.imports
  const folder = repo.folder
  assert.match(folder, /^four-choice-reversal\/run-four-choice-reversal-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ$/)
  assert.equal(last.outputsDir, folder)
  assert.deepEqual(repo, { workspaceId: 42, name: 'four-choice-example-main', url: FOUR_CHOICE.repoZipUrl, folder, resourceType: 'g' })
  assert.equal(data.folder, `${folder}/inputs`)
  assert.equal(data.resourceType, 'e')
  assert.match(data.url, /^https:\/\/storage\.googleapis\.com\/maabcd\/uploads\/four-choice-reversal\/user-1\//)

  assert.deepEqual(f.runInput(), {
    repo: { dir: `${folder}/four-choice-example-main`, discard: true },
    setup: { requirements: 'requirements.txt', pythonPath: ['scripts'], install: ['scripts/install.py', 'scripts/setup.py', 'scripts/pyproject.toml'] },
    notebooks: ['notebooks/01_load.ipynb'],
    inputDir: `${folder}/inputs`,
    outputDir: `${folder}/outputs`,
    results: { notebooks: `${folder}/notebooks`, log: `${folder}/run.log` },
  })
})

test('a protocol can override how its repository is set up', async () => {
  const f = fakes()
  await run(f, { protocol: { ...FOUR_CHOICE, requirements: 'env/requirements.txt', pythonPath: [], install: ['setup/pyproject.toml'] } })
  const { requirements, pythonPath, install } = f.runInput()!.setup!
  assert.deepEqual({ requirements, pythonPath, install }, { requirements: 'env/requirements.txt', pythonPath: [], install: ['setup/pyproject.toml'] })
})

test('runs the notebooks directly in the notebooks folder, in byte order of their names', async () => {
  const f = fakes()
  const listed = (path: string) => ({ id: 7, name: path, status: 'a' as const, path })
  f.api.getWorkspaceResources = async () => {
    const repo = f.imports.find((i) => i.resourceType === 'g')!
    const nb = `${repo.folder}/${repo.name}/notebooks`
    return [`${nb}/10_c.ipynb`, `${nb}/02_b.ipynb`, `${nb}/01_a.ipynb`, `${nb}/old/00_x.ipynb`, `${nb}/.hidden.ipynb`,
      `${nb}/notes.md`, `${repo.folder}/${repo.name}/other/01.ipynb`].map(listed)
  }
  await run(f)
  assert.deepEqual(f.runInput()?.notebooks, ['notebooks/01_a.ipynb', 'notebooks/02_b.ipynb', 'notebooks/10_c.ipynb'])
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
  assert.equal(f.runInput()?.inputDir, undefined)
  assert.deepEqual(last.steps.filter((s) => s.state === 'skipped').map((s) => s.id), ['upload', 'data'])
})

test('a failed upload marks only the upload step failed', async () => {
  const states = await run(fakes({ failUpload: true }))
  const last = states[states.length - 1]
  assert.equal(last.phase, 'failed')
  // The user reads plain words; the 403 goes to the console.
  assert.equal(last.error, 'Your file could not be uploaded. Check your connection and try again.')
  assert.deepEqual(last.steps.filter((s) => s.state === 'failed').map((s) => s.id), ['upload'])
})

test('the run is followed through the workspace\'s placeholder: running while listed, finished once gone', async () => {
  const states = await run(fakes({ runPolls: 3 }))
  assert.ok(states.some((s) => s.steps.find((x) => x.id === 'run')?.detail === 'Running the notebooks'))
  const last = states[states.length - 1]
  assert.equal(last.phase, 'succeeded')
  assert.equal(last.message, 'The analysis has finished')
  assert.match(last.steps.find((s) => s.id === 'run')?.detail ?? '', /^Results in four-choice-reversal\/run-/)
})

test('a run that ends between two polls is still judged by its executed notebooks', async () => {
  RUN_SETTINGS.runStartTimeoutMs = 10
  assert.equal((await run(fakes({ runPolls: 0 }))).pop()!.phase, 'succeeded')
  assert.equal((await run(fakes({ runPolls: 0, runFails: 'notebook' }))).pop()!.phase, 'failed')
})

test('an import OSB marks as failed stops the run', async () => {
  const f = fakes()
  f.api.getWorkspaceResources = async () => {
    const data = f.imports.find((i) => i.resourceType === 'e')!
    return [{ id: 3, name: 'animal_01.xlsx', status: 'e', path: `${data.folder}/animal_01.xlsx` }]
  }
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.equal(last.error, 'The files could not be copied into the workspace. Please try again.')
  assert.ok(!f.calls.some((c) => c.startsWith('run')))
})

test('a reused workspace\'s older failed or stuck resources don\'t affect this run', async () => {
  const f = fakes()
  const list = f.api.getWorkspaceResources.bind(f.api)
  f.api.getWorkspaceResources = async (t, ws) => [
    { id: 1, name: 'old.xlsx', status: 'e', path: 'four-choice-reversal/run-old/inputs/old.xlsx' },
    { id: 2, name: 'stuck.nwb', status: 'p', path: 'stuck.nwb' },
    ...await list(t, ws),
  ]
  assert.equal((await run(f, { workspaceId: 7 })).pop()!.phase, 'succeeded')
})

test('imports that leave no notebooks in the notebooks folder stop the run', async () => {
  const f = fakes({ resources: [[{ id: 7, name: '01_load.ipynb', status: 'a', path: 'elsewhere/notebooks/01_load.ipynb' }]] })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /no notebooks to run/)
  assert.equal(last.steps.find((s) => s.id === 'imports')?.state, 'failed')
  assert.ok(!f.calls.some((c) => c.startsWith('run')))
})

test('a file the protocol cannot read fails before anything is uploaded or created', async () => {
  const f = fakes()
  const last = (await run(f, { file: new File(['x'], 'notes.txt') })).pop()!
  assert.equal(last.phase, 'failed')
  assert.deepEqual(f.calls, [])
})

test('an empty file fails before anything is uploaded or created', async () => {
  const f = fakes()
  const last = (await run(f, { file: new File([], 'animal_01.xlsx') })).pop()!
  assert.equal(last.phase, 'failed')
  assert.equal(last.error, 'animal_01.xlsx is empty.')
  assert.deepEqual(f.calls, [])
})

test('a repository zip that is not GitHub codeload is not offered', async () => {
  const f = fakes()
  const last = (await run(f, { protocol: { ...FOUR_CHOICE, repoZipUrl: 'http://example.org/x.zip' } })).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /isn't available yet/)
})

test('a run whose notebook failed is seen in notebooks.failed/, and says so in plain words', async () => {
  RUN_SETTINGS.runResultTimeoutMs = 60_000 // decided by the listing, not by waiting
  const f = fakes({ runFails: 'notebook' })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.equal(last.steps.find((s) => s.id === 'run')?.state, 'failed')
  assert.equal(last.error, 'The analysis did not finish. Open the workspace to see what happened.')
})

test('a run that stops before any notebook (nothing listed) failed, and says so in plain words', async () => {
  const f = fakes({ runFails: 'setup' })
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.equal(last.steps.find((s) => s.id === 'run')?.state, 'failed')
  assert.equal(last.error, 'The analysis did not finish. Open the workspace to see what happened.')
})

test('a protocol without a repository fails clearly', async () => {
  const f = fakes()
  const last = (await run(f, { protocol: { id: 'open-field', name: 'Open field task' } })).pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /isn't available yet/)
})

test('a failed repository import marks the repository step', async () => {
  const f = fakes()
  f.api.importResource = async () => { throw new Error('500 MalformedModelDictionaryError') }
  const last = (await run(f)).pop()!
  assert.equal(last.phase, 'failed')
  assert.deepEqual(last.steps.filter((s) => s.state === 'failed').map((s) => s.id), ['repo'])
  assert.equal(last.steps.find((s) => s.id === 'upload')?.state, 'succeeded')
})

test('a run still going past the watch limit stops being followed, and says so', async () => {
  RUN_SETTINGS.runTimeoutMs = 5
  const last = (await run(fakes({ runPolls: 1_000 }))).pop()!
  assert.equal(last.phase, 'stillRunning')
  assert.match(last.message, /Still running in the workspace/)
  assert.equal(last.steps.find((s) => s.id === 'run')?.detail, 'Still running in the workspace')
  assert.ok(!last.steps.some((s) => s.state === 'running'))
})

test('an ended session mid-run asks to sign in again', async () => {
  let calls = 0
  const expiring = { ...auth, getToken: async () => {
    if (++calls > 2) throw new Error('No access token available. Please sign in again.')
    return 'token'
  } }
  const states: RunState[] = []
  await createRunProtocolUseCase(expiring, fakes().api, fakes().store)(
    { protocol: FOUR_CHOICE, file: file(), workspaceName: 'Four-choice' }, (s) => states.push(s))
  const last = states.pop()!
  assert.equal(last.phase, 'failed')
  assert.match(last.error ?? '', /sign in again/)
})

test('an EMBER-DANDI upload gets the run\'s workspace recorded in its dandiset, and the dialog the dandiset id', async () => {
  const f = fakes()
  const seen: { dandisets?: unknown } = {}
  const store: IObjectStore = {
    async put(input) {
      f.calls.push('upload')
      seen.dandisets = input.dandisets
      return {
        url: 'https://api-dandi.example.org/api/assets/a/download/', key: 'k', dandisetId: '000777',
        recordWorkspace: async (id) => { f.calls.push(`record:${id}`) },
      }
    },
  }
  const states: RunState[] = []
  await createRunProtocolUseCase(auth, f.api, store)(
    { protocol: { ...FOUR_CHOICE, maabcdDandisetId: '000533' }, file: file(), workspaceName: 'Four-choice', dandisetId: '000123' },
    (s) => states.push(s))
  const last = states[states.length - 1]

  assert.equal(last.phase, 'succeeded', last.error)
  assert.equal(last.dandisetId, '000777')
  // Recorded once the workspace exists, before anything is imported into it.
  const create = f.calls.findIndex((c) => c.startsWith('create:'))
  assert.equal(f.calls[create + 1], 'record:42')
  assert.deepEqual(seen.dandisets, {
    user: '000123', newName: 'Four-choice reversal digging task (IDP)', maabcd: '000533',
    protocol: { id: 'four-choice-reversal', name: 'Four-choice reversal digging task', url: 'https://github.com/maracbaylis/four-choice-example' },
  })
})

test('with "Share with MAABCD" unticked, nothing goes to the protocol\'s MAABCD dandiset', async () => {
  const f = fakes()
  const seen: { dandisets?: { maabcd?: string } } = {}
  const store: IObjectStore = {
    async put(input) {
      seen.dandisets = input.dandisets
      return { url: 'https://api-dandi.example.org/api/assets/a/download/', key: 'k', dandisetId: '000777' }
    },
  }
  const states: RunState[] = []
  await createRunProtocolUseCase(auth, f.api, store)(
    { protocol: { ...FOUR_CHOICE, maabcdDandisetId: '000533' }, file: file(), workspaceName: 'Four-choice', shareWithMaabcd: false },
    (s) => states.push(s))

  assert.equal(states[states.length - 1].phase, 'succeeded')
  assert.equal(seen.dandisets?.maabcd, undefined)
})

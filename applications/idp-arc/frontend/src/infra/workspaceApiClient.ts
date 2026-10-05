import type {
  ImportResourceInput,
  IWorkspaceApi,
  RunStatusResult,
  StartRunInput,
  WorkspaceResourceState,
} from '../core/ports/IWorkspaceApi'
import type { Workspace } from '../core/types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * WorkspaceApiClient — concrete IWorkspaceApi implementation.
 *
 * All fetch() calls to the OSB workspace REST API live here.
 * Use-cases never see fetch — only the IWorkspaceApi interface.
 */
export class WorkspaceApiClient implements IWorkspaceApi {
  constructor(
    private readonly baseApiUrl: string,  // e.g. "https://www.v2dev.opensourcebrain.org/proxy/workspaces/api"
    private readonly listUrl: string,     // full workspaces list URL with pagination params
  ) {}

  async listWorkspaces(token: string): Promise<Workspace[]> {
    const res = await fetch(this.listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Workspace list API responded ${res.status} ${res.statusText}`)
    }
    const data: unknown = await res.json()
    if (Array.isArray(data)) return data as Workspace[]
    const obj = data as Record<string, unknown>
    return (obj.results ?? obj.items ?? obj.workspaces ?? []) as Workspace[]
  }

  async createWorkspace(token: string, name: string, tags: string[] = []): Promise<number> {
    const RETRYABLE = new Set([502, 503, 504])
    const MAX_ATTEMPTS = 3
    let lastError: Error = new Error('Workspace creation failed')

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await sleep(attempt * 2_000)

      const res = await fetch(`${this.baseApiUrl}/workspace`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: name.trim(),
          ...(tags.length ? { tags: tags.map((tag) => ({ tag })) } : {}),
        }),
      })

      if (res.ok) {
        const ws = (await res.json()) as { id: number }
        return ws.id
      }

      let detail = ''
      try {
        const body = await res.json() as Record<string, unknown>
        detail = (body.description ?? body.message ?? body.detail ?? '') as string
      } catch { /* non-JSON body */ }

      lastError = new Error(
        res.status === 405
          ? `Not allowed to create a new workspace on this platform (HTTP 405).${detail ? ` ${detail}` : ''}`
          : RETRYABLE.has(res.status)
            ? `Workspace service unavailable (HTTP ${res.status}), attempt ${attempt}/${MAX_ATTEMPTS}.`
            : `Failed to create workspace: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
      )

      if (!RETRYABLE.has(res.status)) break
    }

    throw lastError
  }

  async getWorkspaceResources(token: string, workspaceId: number): Promise<WorkspaceResourceState[]> {
    const res = await fetch(`${this.baseApiUrl}/workspace/${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Reading workspace ${workspaceId} failed: ${res.status} ${res.statusText}`)
    const ws = (await res.json()) as { resources?: { id: number; name: string; status?: 'p' | 'a' | 'e'; path?: string }[] }
    return (ws.resources ?? []).map(({ id, name, status, path }) => ({ id, name, status, path }))
  }

  async importResource(token: string, input: ImportResourceInput): Promise<void> {
    const folder = `${input.folder.replace(/\/+$/, '')}/`
    const res = await fetch(`${this.baseApiUrl}/workspaceresource`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        name: input.name,
        resource_type: input.resourceType,
        origin: { path: input.url },
        // A folder path (trailing slash): OSB copies the download into it (a zip is unpacked there).
        path: folder,
        // Sent as well because OSB's WorkspaceresourceService.to_dao only renames `path` to the
        // database's `folder` when a `folder` key is present (`if 'folder' in ws_dict`); with
        // `path` alone the create fails with MalformedModelDictionaryError.
        folder,
      }),
    })
    if (!res.ok) {
      throw new Error(`Importing ${input.name} into the workspace failed: ${res.status} ${res.statusText} ${await res.text().catch(() => '')}`.trim())
    }
  }

  async startRun(token: string, workspaceId: number, input: StartRunInput): Promise<{ workflow: string }> {
    const { repo, setup, notebooks, inputs, outputs, results } = input
    const res = await fetch(`${this.baseApiUrl}/workspace/${workspaceId}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        ...(setup ? { setup: { requirements: setup.requirements, python_path: setup.pythonPath, install: setup.install } } : {}),
        notebooks,
        ...(inputs?.length ? { inputs: inputs.map((i) => ({ from_volume: i.fromVolume, to_repo: i.toRepo })) } : {}),
        ...(outputs?.length ? { outputs: outputs.map((o) => ({ from_repo: o.fromRepo, to_volume: o.toVolume })) } : {}),
        results,
      }),
    })
    if (!res.ok) {
      throw new Error(`Starting the notebooks failed: ${res.status} ${res.statusText} ${await res.text().catch(() => '')}`.trim())
    }
    const body = (await res.json()) as { workflow: string }
    return { workflow: body.workflow }
  }

  async getRun(token: string, workspaceId: number, workflow: string): Promise<RunStatusResult> {
    const res = await fetch(`${this.baseApiUrl}/workspace/${workspaceId}/run/${encodeURIComponent(workflow)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Reading the run's state failed: ${res.status} ${res.statusText}`)
    // `status` is Argo's phase as is (as CloudHarness's workflows API reports it); none yet means
    // the workflow was only just submitted.
    const body = (await res.json()) as { status?: string; message?: string }
    const phase: RunStatusResult['phase'] = body.status === 'Succeeded' ? 'Succeeded'
      : body.status === 'Running' ? 'Running'
        : body.status === 'Failed' || body.status === 'Error' || body.status === 'Skipped' ? 'Failed'
          : 'Pending'
    return { phase, message: body.message ?? undefined }
  }
}

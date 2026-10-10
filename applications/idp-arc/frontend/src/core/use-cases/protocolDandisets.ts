import type { IDandiDirectApi } from '../ports/IDandiDirectApi'
import type { IEmberAuth } from '../ports/IEmberAuth'
import { readProtocolLink, readWorkspaceLink, withProtocolLink, withWorkspaceLink, type DandisetMetadata } from '../dandisetLinks'
import { EMBER_SIGN_IN, UserFacingError } from '../userMessages'

/** One of the researcher's dandisets for a protocol, as the upload dialog offers it. */
export interface ProtocolDandiset {
  id: string
  name: string
  /** The OSB workspace recorded in its metadata, when the researcher still has it. */
  workspaceId?: number
}

export interface ProtocolRef {
  id: string
  name: string
  /** A page about the protocol (its repository), recorded with the link. */
  url?: string
}

/**
 * The researcher's EMBER-DANDI dandisets, organised by protocol through their metadata
 * (dandisetLinks.ts): which ones hold data for a protocol, which OSB workspace each runs in, and
 * the writes that record both.
 */
export function createProtocolDandisetsUseCases(deps: {
  emberAuth: Pick<IEmberAuth, 'getToken'>
  direct: IDandiDirectApi
  /** Scopes workspace links to one OSB environment. */
  osbDomain: string
  workspaceUrl: (workspaceId: number) => string
}) {
  const { emberAuth, direct, osbDomain, workspaceUrl } = deps

  function token(): string {
    const t = emberAuth.getToken()
    if (!t) throw new UserFacingError(EMBER_SIGN_IN, 'No EMBER-DANDI token (not signed in, or it expired)')
    return t
  }

  /**
   * The researcher's dandisets recorded for `protocolId`, each with its workspace. One metadata
   * read per dandiset they own (EMBER's list carries no metadata). A workspace link is dropped
   * when it isn't among `ownWorkspaceIds` (deleted, or someone else's): a new one is made then.
   */
  async function listForProtocol(protocolId: string, ownWorkspaceIds: number[]): Promise<ProtocolDandiset[]> {
    const t = token()
    const own = await direct.listOwnDandisets(t)
    const read = await Promise.all(own.map(async (d) => {
      try {
        return { d, metadata: await direct.getDraftMetadata(t, d.id) }
      } catch (err) {
        console.warn(`Could not read the metadata of dandiset ${d.id}`, err)
        return null
      }
    }))
    return read
      .filter((r): r is { d: (typeof own)[number]; metadata: DandisetMetadata } => !!r && readProtocolLink(r.metadata) === protocolId)
      .map(({ d, metadata }) => {
        const linked = readWorkspaceLink(metadata, osbDomain)
        return { id: d.id, name: d.name, ...(linked && ownWorkspaceIds.includes(linked) ? { workspaceId: linked } : {}) }
      })
  }

  /** A new dandiset in the researcher's account, recorded for `protocol`. */
  async function createForProtocol(name: string, protocol: ProtocolRef): Promise<string> {
    return direct.createDandiset(token(), name, withProtocolLink({}, protocol))
  }

  /** Records `workspaceId` (and `protocol`, if missing) in the dandiset's metadata; no write when
   *  both are already there. */
  async function recordWorkspace(dandisetId: string, workspaceId: number, protocol: ProtocolRef): Promise<void> {
    const t = token()
    const metadata = await direct.getDraftMetadata(t, dandisetId)
    if (readWorkspaceLink(metadata, osbDomain) === workspaceId && readProtocolLink(metadata) === protocol.id) return
    const linked = withWorkspaceLink(withProtocolLink(metadata, protocol), osbDomain, workspaceId, workspaceUrl(workspaceId))
    await direct.updateDraftMetadata(t, dandisetId, linked)
  }

  return { listForProtocol, createForProtocol, recordWorkspace }
}

export type ProtocolDandisets = ReturnType<typeof createProtocolDandisetsUseCases>

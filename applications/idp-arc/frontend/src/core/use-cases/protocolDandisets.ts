import { DRAFT_STATUS, type IDandiDirectApi, type PublishedVersion } from '../ports/IDandiDirectApi'
import type { IEmberAuth } from '../ports/IEmberAuth'
import { readProtocolLink, readWorkspaceLink, withProtocolLink, withWorkspaceLink, type DandisetMetadata } from '../dandisetLinks'
import { RUN_SETTINGS } from '../runSettings'
import { EMBER_SIGN_IN, UserFacingError } from '../userMessages'
import { pollUntil } from './runProgress'

/** The license of the dandisets IDP creates. EMBER publishes no dandiset without one. */
export const DANDISET_LICENSE = ['spdx:CC-BY-4.0']

/** Statuses a draft can be published from (or, when Published, already was). */
const PUBLISHABLE: string[] = [DRAFT_STATUS.valid, DRAFT_STATUS.published]

/** Why a dandiset could not be published, for the console; the user reads the DOI step's message. */
class PublishError extends Error {
  constructor(dandisetId: string, reason: string) {
    super(`Dandiset ${dandisetId} could not be published: ${reason}`)
  }
}

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
    return direct.createDandiset(token(), name, withProtocolLink({ license: DANDISET_LICENSE }, protocol))
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

  /**
   * Publishes the dandiset's draft as a new version and returns it, with its DOI; null if
   * `stopped` first. EMBER publishes only a valid draft, and validates it again after every change.
   */
  async function publish(dandisetId: string, stopped: () => boolean = () => false): Promise<PublishedVersion | null> {
    const t = token()
    await addLicenseIfMissing(t, dandisetId)
    const status = await waitUntilPublishable(t, dandisetId, stopped)
    if (!status) return null
    // Unchanged since the last version: that version already holds this data.
    if (status === DRAFT_STATUS.published) return latestVersion(t, dandisetId)
    return publishNewVersion(t, dandisetId, stopped)
  }

  /** Older IDP dandisets have no license. */
  async function addLicenseIfMissing(t: string, dandisetId: string) {
    const metadata = await direct.getDraftMetadata(t, dandisetId)
    if (!metadata.license) await direct.updateDraftMetadata(t, dandisetId, { ...metadata, license: DANDISET_LICENSE })
  }

  /** Waits for EMBER to finish checking the draft; its status, or null if `stopped`. */
  async function waitUntilPublishable(t: string, dandisetId: string, stopped: () => boolean): Promise<string | null> {
    let status = ''
    const ended = await pollUntil(async () => {
      const draft = await direct.getDraftStatus(t, dandisetId)
      if (draft.status === DRAFT_STATUS.invalid) throw new PublishError(dandisetId, draft.errors.join('; '))
      status = draft.status
      return PUBLISHABLE.includes(status)
    }, { everyMs: RUN_SETTINGS.publishStatusPollMs, timeoutMs: RUN_SETTINGS.publishDraftValidationTimeoutMs, stopped })
    if (ended === 'timeout') throw new PublishError(dandisetId, `EMBER is still checking it (${status})`)
    return ended === 'done' ? status : null
  }

  /** Publishes the draft, then waits for the new version and its DOI. */
  async function publishNewVersion(t: string, dandisetId: string, stopped: () => boolean): Promise<PublishedVersion | null> {
    const previous = (await direct.getLatestPublished(t, dandisetId))?.version
    await direct.publishDraft(t, dandisetId)
    let latest: PublishedVersion | null = null
    const ended = await pollUntil(async () => {
      latest = await direct.getLatestPublished(t, dandisetId)
      return !!latest?.doi && latest.version !== previous
    }, { everyMs: RUN_SETTINGS.publishStatusPollMs, timeoutMs: RUN_SETTINGS.publishVersionTimeoutMs, stopped })
    if (ended === 'timeout') throw new PublishError(dandisetId, 'the new version did not appear in time')
    return ended === 'done' ? latest : null
  }

  async function latestVersion(t: string, dandisetId: string): Promise<PublishedVersion> {
    const latest = await direct.getLatestPublished(t, dandisetId)
    if (!latest?.doi) throw new PublishError(dandisetId, 'its latest version has no DOI')
    return latest
  }

  return { listForProtocol, createForProtocol, recordWorkspace, publish }
}

export type ProtocolDandisets = ReturnType<typeof createProtocolDandisetsUseCases>

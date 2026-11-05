import type { IAuthClient } from '../ports/IAuthClient'
import type { IDandiDirectApi } from '../ports/IDandiDirectApi'
import type { IEmberAuth } from '../ports/IEmberAuth'
import type { IEmberUploadApi } from '../ports/IEmberUploadApi'
import type { IObjectStore, ObjectUploadInput, StoredObject } from '../ports/IObjectStore'
import { computeDandiEtag, type PartPlan } from '../dandiEtag'
import { dandisetReadme, withReadme } from '../dandisetReadme'
import { convertToBids, type OutputFile } from '../bids/convert'
import { isMergedFile, mergeWithDraft } from '../bids/merge'
import { pathSafe } from '../pathSafe'
import { utcStamp } from '../workspaceLayout'
import { EMBER_SIGN_IN, UserFacingError } from '../userMessages'
import { DANDISET_LICENSE, type ProtocolDandisets } from './protocolDandisets'

export { EMBER_SIGN_IN }

/**
 * The EMBER-DANDI object store. `put` uploads into the researcher's own dandiset (the copy OSB
 * imports); `recordWorkspace` then records the workspace in its metadata. `shareWithMaabcd` makes a
 * second copy, into the protocol's MAABCD dandiset, through OSB's `/dandi` endpoints.
 *
 * Each finished part of `put` is reported as a checkpoint (EmberUploadCheckpoint): given back on a
 * retry, the dandiset is not created again and a copy already made is not made again.
 *
 * No wait for "valid" before returning: the blob is checked against the etag when the upload is
 * validated (synchronously, before the asset exists), so its download link works at once.
 * Asset *metadata* validation is a separate, asynchronous check that a plain file may never pass.
 */
/** What a put has done so far; see IObjectStore's UploadCheckpoint. */
export interface EmberUploadCheckpoint {
  /** The researcher's dandiset, once picked or created. */
  userDandisetId?: string
  /** The file's DANDI etag, once computed. */
  etag?: string
  /** Where their copy goes, chosen before it is registered: a retry registers the same path. */
  path?: string
  /** Their own copy, once registered. */
  own?: { assetId: string; assetPath: string }
  /** BIDS files made from it already in the dandiset, by path. */
  bidsDone?: string[]
}

/** How many BIDS files are written at once: the browser opens at most ~6 connections per host. */
export const BIDS_WRITES_AT_ONCE = 4

export function createEmberObjectStore(
  osbAuth: Pick<IAuthClient, 'getToken'>,
  emberAuth: Pick<IEmberAuth, 'getToken' | 'getAccount'>,
  direct: IDandiDirectApi,
  osb: IEmberUploadApi,
  dandisets: Pick<ProtocolDandisets, 'createForProtocol' | 'recordWorkspace'>,
  /** EMBER's public API origin (`https://api-dandi.emberarchive.org`): the download link has to
   *  work from OSB's cluster, so never the browser's same-origin proxy. */
  emberApiOrigin: string,
  /** EMBER-DANDI's web origin (`https://dandi.emberarchive.org`): the dandiset page in the README. */
  emberWebOrigin: string,
): IObjectStore {
  return {
    async put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject> {
      const token = emberAuth.getToken()
      if (!token) throw new UserFacingError(EMBER_SIGN_IN, 'No EMBER-DANDI token (not signed in, or it expired)')
      const saved: EmberUploadCheckpoint = { ...(input.resume as EmberUploadCheckpoint | undefined) }
      const save = (patch: EmberUploadCheckpoint) => {
        Object.assign(saved, patch)
        input.onCheckpoint?.({ ...saved })
      }

      // What goes up is the file with the README packed in, once the dandiset (its link) is known.
      let file = input.file
      const progress = (sent: number) => onProgress?.(Math.min(sent, file.size), file.size)
      progress(saved.own ? file.size : 0)

      // The researcher's own copy.
      const protocol = input.dandisets?.protocol ?? { id: input.protocolId, name: input.protocolId }
      const userDandisetId = saved.userDandisetId || input.dandisets?.user
        || await dandisets.createForProtocol(input.dandisets?.newName || protocol.name, protocol)
      if (saved.userDandisetId !== userDandisetId) save({ userDandisetId })
      // The dandiset's own name: a re-upload into an existing one keeps the name it has.
      const name = await dandisetName(token, userDandisetId) || input.dandisets?.newName || protocol.name
      // The upload is the dataset's source data, one folder per upload: BIDS leaves sourcedata/ unchecked.
      const folder = saved.path ? saved.path.slice(0, saved.path.lastIndexOf('/')) : `sourcedata/upload-${utcStamp(new Date())}`
      const readme = dandisetReadme({
        name,
        dandisetId: userDandisetId,
        dandisetUrl: `${emberWebOrigin.replace(/\/+$/, '')}/dandiset/${userDandisetId}`,
        protocol,
        originalName: input.file.name,
        folder,
      })
      file = await withReadme(input.file, readme)
      const path = saved.path ?? `${folder}/${pathSafe(file.name)}`
      // Converted and checked before anything is written, so a problem leaves the dandiset as it was.
      const files = await bidsFilesFor(input.file, input.bids, { name, authors: await authorsOf(input.bids.authors) }, path)
      await checkAnimalIds(token, userDandisetId, files)
      let asset = saved.own
      if (!asset) {
        const { etag, parts: plan } = await computeDandiEtag(file)
        save({ etag, path })
        const init = await direct.initUpload(token, userDandisetId, file.size, etag)
        const uploaded = await putParts(init.parts, plan, file, progress)
        asset = await direct.finalizeUpload(token, {
          uploadId: init.uploadId, dandisetId: userDandisetId, path, parts: uploaded, blobId: init.blobId,
        })
        save({ own: { assetId: asset.assetId, assetPath: asset.assetPath } })
      }
      await putBidsFiles(token, userDandisetId, files, saved, save, input.onBidsProgress)
      progress(file.size)

      return {
        url: `${emberApiOrigin.replace(/\/+$/, '')}/api/assets/${asset.assetId}/download/`,
        key: asset.assetPath,
        name: file.name,
        size: file.size,
        dandisetId: userDandisetId,
        etag: saved.etag,
        readme,
      }
    },

    async recordWorkspace(stored, workspaceId, protocol) {
      if (stored.dandisetId) await dandisets.recordWorkspace(stored.dandisetId, workspaceId, protocol)
    },

    async shareWithMaabcd(stored, dandisetId, original) {
      // The bytes of the researcher's copy: the same README packed in the same way.
      const file = original && stored.readme ? await withReadme(original, stored.readme) : original
      const hashed = !stored.etag && file ? await computeDandiEtag(file) : undefined
      const etag = stored.etag ?? hashed?.etag
      if (!etag) throw new Error('The MAABCD copy needs the file\'s checksum, but no file is selected (the page was reloaded)')
      const osbToken = await osbAuth.getToken()
      const brokered = await osb.getUploadUrls(osbToken, { dandisetId, filename: stored.name, size: stored.size ?? file?.size ?? 0, dandiEtag: etag })
      // EMBER usually holds the bytes already (the researcher's copy): then there are no parts to send.
      let parts: { partNumber: number; size: number; etag: string }[] = []
      if (brokered.parts.length) {
        if (!file) throw new Error('EMBER needs the file for the MAABCD copy, but none is selected (the page was reloaded)')
        parts = await putParts(brokered.parts, (hashed ?? await computeDandiEtag(file)).parts, file, () => {})
      }
      await osb.validateUpload(osbToken, {
        dandisetId: brokered.dandisetId,
        path: brokered.path,
        uploadId: brokered.uploadId,
        parts: brokered.blobId ? undefined : parts,
        blobId: brokered.blobId,
      })
    },
  }

  /** BIDS files from an upload's file, as put makes them; `source` is where the upload itself is. */
  async function bidsFilesFor(file: File, bids: ObjectUploadInput['bids'], made: { name: string; authors?: string[] },
    source: string): Promise<OutputFile[]> {
    const conversion = await convertToBids(file, bids.config, {
      name: made.name,
      protocol: bids.protocol,
      license: DANDISET_LICENSE[0].replace(/^spdx:/, ''),
      authors: made.authors,
      source,
    })
    const problem = conversion.problems.find((p) => p.level === 'error')
    if (problem) throw new UserFacingError(problem.message)
    // The upload itself is already in sourcedata/ (with its README): only what was made from it.
    return conversion.files.filter((f) => !f.path.startsWith('sourcedata/'))
  }

  /** Stops an Animal ID the dandiset already has in other upper/lower case: BIDS labels must not differ only in case. */
  async function checkAnimalIds(token: string, dandisetId: string, files: OutputFile[]) {
    const incoming = files.find((f) => f.path === 'participants.tsv')?.content
    if (typeof incoming !== 'string') return
    const existing = await direct.readDraftFile(token, dandisetId, 'participants.tsv')
    if (!existing) return
    const ids = (tsv: string) => tsv.split('\n').slice(1).map((l) => l.split('\t')[0]).filter(Boolean)
    const known = new Map(ids(existing).map((id) => [id.toLowerCase(), id]))
    for (const id of ids(incoming)) {
      const other = known.get(id.toLowerCase())
      if (other && other !== id) {
        const [mine, theirs] = [id.replace(/^sub-/, ''), other.replace(/^sub-/, '')]
        throw new UserFacingError(`Animal ID ${mine} is already in this dandiset as ${theirs}. Write it ${theirs} to update that animal, or use a different ID.`)
      }
    }
  }

  /** `content`, merged with the dandiset's copy at `draftPath` when `path` is a per-animal file. */
  async function mergedWithDraft(token: string, dandisetId: string, path: string, draftPath: string,
    content: OutputFile['content']): Promise<OutputFile['content']> {
    const existing = isMergedFile(path) ? await direct.readDraftFile(token, dandisetId, draftPath) : null
    if (existing === null) return content
    const incoming = typeof content === 'string' ? content : content instanceof Blob ? await content.text() : new TextDecoder().decode(content)
    return mergeWithDraft(path, existing, incoming)
  }

  /** The EMBER-DANDI account's name, which the archive credits; `fallback` when it has none or can't be read. */
  async function authorsOf(fallback: string[] | undefined): Promise<string[] | undefined> {
    const account = await emberAuth.getAccount().catch(() => null)
    const name = account?.name?.trim()
    return name ? [name] : fallback
  }

  async function dandisetName(token: string, dandisetId: string): Promise<string | undefined> {
    const { name } = await direct.getDraftMetadata(token, dandisetId)
    return typeof name === 'string' && name.trim() ? name.trim() : undefined
  }

  /** Each BIDS file into the dandiset, BIDS_WRITES_AT_ONCE at a time; one already there with other
   *  content is replaced (a shared description, or a corrected table), except the per-animal files,
   *  which are merged with it. Each is recorded, so a retry skips it. After a failure no new write
   *  starts; the running ones finish, then the failure is thrown. */
  async function putBidsFiles(token: string, dandisetId: string, files: OutputFile[], saved: EmberUploadCheckpoint,
    save: (patch: EmberUploadCheckpoint) => void, onWritten?: (written: number, total: number) => void) {
    const todo = files.filter((f) => !saved.bidsDone?.includes(f.path))
    let written = files.length - todo.length
    onWritten?.(written, files.length)
    let failure: { error: unknown } | undefined
    const worker = async () => {
      for (let next = todo.shift(); next && !failure; next = todo.shift()) {
        try {
          await putBidsFile(token, dandisetId, next)
          save({ bidsDone: [...(saved.bidsDone ?? []), next.path] })
          onWritten?.(++written, files.length)
        } catch (error) {
          failure ??= { error }
        }
      }
    }
    await Promise.all(Array.from({ length: BIDS_WRITES_AT_ONCE }, worker))
    if (failure) throw failure.error
  }

  async function putBidsFile(token: string, dandisetId: string, { path, content }: OutputFile) {
    const merged = await mergedWithDraft(token, dandisetId, path, path, content)
    const file = new File([merged as BlobPart], path.slice(path.lastIndexOf('/') + 1))
    const { etag, parts: plan } = await computeDandiEtag(file)
    const init = await direct.initUpload(token, dandisetId, file.size, etag)
    const uploaded = await putParts(init.parts, plan, file, () => {})
    await direct.finalizeUpload(token, { uploadId: init.uploadId, dandisetId, path, parts: uploaded, blobId: init.blobId, replace: true })
  }

  async function putParts(parts: { partNumber: number; url: string }[], plan: PartPlan[], file: File,
    report: (sentInTransfer: number) => void) {
    // Every part or none (deduplicated): a shorter list would silently upload a truncated file.
    if (parts.length && parts.length !== plan.length) {
      throw new Error(`EMBER returned ${parts.length} part URLs for a file of ${plan.length} parts`)
    }
    const result: { partNumber: number; size: number; etag: string }[] = []
    let sent = 0
    for (const part of parts) {
      const slice = plan.find((p) => p.partNumber === part.partNumber)
      if (!slice) throw new Error(`EMBER asked for part ${part.partNumber}, which this file doesn't have`)
      const partEtag = await direct.putPart(part.url, file.slice(slice.start, slice.end))
      result.push({ partNumber: part.partNumber, size: slice.size, etag: partEtag })
      sent += slice.size
      report(sent)
    }
    return result
  }
}

import type { IAuthClient } from '../ports/IAuthClient'
import type { IDandiDirectApi } from '../ports/IDandiDirectApi'
import type { IEmberAuth } from '../ports/IEmberAuth'
import type { IEmberUploadApi } from '../ports/IEmberUploadApi'
import type { IObjectStore, ObjectUploadInput, StoredObject } from '../ports/IObjectStore'
import { computeDandiEtag, type PartPlan } from '../dandiEtag'
import { EMBER_SIGN_IN, UserFacingError } from '../userMessages'
import type { ProtocolDandisets } from './protocolDandisets'

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
  /** Their own copy, once registered. */
  own?: { assetId: string; assetPath: string }
}

export function createEmberObjectStore(
  osbAuth: Pick<IAuthClient, 'getToken'>,
  emberAuth: Pick<IEmberAuth, 'getToken'>,
  direct: IDandiDirectApi,
  osb: IEmberUploadApi,
  dandisets: Pick<ProtocolDandisets, 'createForProtocol' | 'recordWorkspace'>,
  /** EMBER's public API origin (`https://api-dandi.emberarchive.org`): the download link has to
   *  work from OSB's cluster, so never the browser's same-origin proxy. */
  emberApiOrigin: string,
): IObjectStore {
  return {
    async put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject> {
      const { file } = input
      const token = emberAuth.getToken()
      if (!token) throw new UserFacingError(EMBER_SIGN_IN, 'No EMBER-DANDI token (not signed in, or it expired)')
      const maabcdAggregateDandisetId = input.dandisets?.maabcd || undefined
      const saved: EmberUploadCheckpoint = { ...(input.resume as EmberUploadCheckpoint | undefined) }
      const save = (patch: EmberUploadCheckpoint) => {
        Object.assign(saved, patch)
        input.onCheckpoint?.({ ...saved })
      }

      const progress = (sent: number) => onProgress?.(Math.min(sent, file.size), file.size)
      progress(saved.own ? file.size : 0)
      // The file's DANDI etag and part plan, computed once for both copies.
      let hashed: Promise<{ etag: string; parts: PartPlan[] }> | undefined
      const hash = () => (hashed ??= computeDandiEtag(file))

      // The researcher's own copy.
      const protocol = input.dandisets?.protocol ?? { id: input.protocolId, name: input.protocolId }
      const userDandisetId = saved.userDandisetId || input.dandisets?.user
        || await dandisets.createForProtocol(input.dandisets?.newName || `IDP upload: ${protocol.name}`, protocol)
      if (saved.userDandisetId !== userDandisetId) save({ userDandisetId })
      let asset = saved.own
      if (!asset) {
        const { etag, parts: plan } = await hash()
        const path = `${pathSafe(input.protocolId)}/${crypto.randomUUID()}/${pathSafe(file.name)}`
        const init = await direct.initUpload(token, userDandisetId, file.size, etag)
        const uploaded = await putParts(init.parts, plan, file, progress)
        asset = await direct.finalizeUpload(token, {
          uploadId: init.uploadId, dandisetId: userDandisetId, path, parts: uploaded, blobId: init.blobId,
        })
        save({ own: { assetId: asset.assetId, assetPath: asset.assetPath } })
      }
      progress(file.size)

      // The MAABCD copy, through OSB: one attempt at a time, and not again once made.
      let shared = false
      let sharing: Promise<void> | undefined
      const shareWithMaabcd = () => {
        if (shared) return Promise.resolve()
        sharing ??= (async () => {
          const { etag, parts: plan } = await hash()
          const osbToken = await osbAuth.getToken()
          const brokered = await osb.getUploadUrls(osbToken, {
            dandisetId: maabcdAggregateDandisetId!, filename: file.name, size: file.size, dandiEtag: etag,
          })
          const brokeredParts = await putParts(brokered.parts, plan, file, () => {})
          await osb.validateUpload(osbToken, {
            dandisetId: brokered.dandisetId,
            path: brokered.path,
            uploadId: brokered.uploadId,
            parts: brokered.blobId ? undefined : brokeredParts,
            blobId: brokered.blobId,
          })
          shared = true
        })().finally(() => { sharing = undefined })
        return sharing
      }

      return {
        url: `${emberApiOrigin.replace(/\/+$/, '')}/api/assets/${asset.assetId}/download/`,
        key: asset.assetPath,
        dandisetId: userDandisetId,
        recordWorkspace: (workspaceId: number) => dandisets.recordWorkspace(userDandisetId, workspaceId, protocol),
        ...(maabcdAggregateDandisetId ? { shareWithMaabcd } : {}),
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
    },
  }
}

/** One asset path segment: DANDI rejects `@` and the like; also stops `/` adding segments. */
function pathSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '') || 'unknown'
}

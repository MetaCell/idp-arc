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
 * Scenario 2: the upload goes to EMBER-DANDI instead of the public bucket, behind the same
 * IObjectStore port, so the run (runProtocol) doesn't change. Each file is uploaded twice:
 *
 *   1. into the researcher's own dandiset, straight from the browser with their own EMBER token
 *      (picked in the dialog, or created here, recorded for the protocol). Its download URL is
 *      what OSB imports into their workspace, so this is the copy the run uses. Once the run has
 *      its workspace, `recordWorkspace` writes it into the dandiset's metadata
 *      (protocolDandisets.ts), so the next upload for this protocol finds both;
 *   2. into the protocol's MAABCD dandiset (protocols.json `maabcdDandisetId`), through OSB's
 *      `/ember` endpoints, which sign with OSB's key. OSB files it under the uploader's own id,
 *      so the dandiset holds every contributor's uploads for the protocol, one folder each.
 *      Skipped when the protocol has no MAABCD dandiset configured.
 *
 * The browser moves the bytes both times. The second transfer is normally empty: EMBER keeps one
 * blob per content, so it answers the second initialize with that blob and no parts (to be
 * confirmed with EMBER for blobs that live in another account's dandiset).
 *
 * No wait for "valid" before returning: the blob is checked against the etag when the upload is
 * validated (synchronously, before the asset exists), so its download link works at once.
 * Asset *metadata* validation is a separate, asynchronous check that a plain file may never pass.
 */
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
      const maabcdDandisetId = input.dandisets?.maabcd || undefined

      // Bytes counted across both transfers, so the progress bar runs once from 0 to 100%.
      const transfers = maabcdDandisetId ? 2 : 1
      const total = file.size * transfers
      let done = 0
      const progress = (sentInTransfer: number) => onProgress?.(Math.min(done + sentInTransfer, total), total)
      const skipTransfer = () => { done += file.size; progress(0) }

      const { etag, parts: plan } = await computeDandiEtag(file)

      // 1. The researcher's own copy.
      const protocol = input.dandisets?.protocol ?? { id: input.protocolId, name: input.protocolId }
      const userDandisetId = input.dandisets?.user
        || await dandisets.createForProtocol(input.dandisets?.newName || `IDP upload: ${protocol.name}`, protocol)
      const path = `${pathSafe(input.protocolId)}/${crypto.randomUUID()}/${pathSafe(file.name)}`
      const init = await direct.initUpload(token, userDandisetId, file.size, etag)
      const uploaded = await putParts(init.parts, plan, file, progress)
      if (!init.parts.length) skipTransfer(); else done += file.size
      const asset = await direct.finalizeUpload(token, {
        uploadId: init.uploadId, dandisetId: userDandisetId, path, parts: uploaded, blobId: init.blobId,
      })

      // 2. The MAABCD copy, through OSB.
      if (maabcdDandisetId) {
        const osbToken = await osbAuth.getToken()
        const brokered = await osb.getUploadUrls(osbToken, {
          dandisetId: maabcdDandisetId, filename: file.name, size: file.size, dandiEtag: etag,
        })
        const brokeredParts = await putParts(brokered.parts, plan, file, progress)
        if (!brokered.parts.length) skipTransfer(); else done += file.size
        await osb.validateUpload(osbToken, {
          dandisetId: brokered.dandisetId,
          path: brokered.path,
          uploadId: brokered.uploadId,
          parts: brokered.blobId ? undefined : brokeredParts,
          blobId: brokered.blobId,
        })
      }
      progress(0)

      return {
        url: `${emberApiOrigin.replace(/\/+$/, '')}/api/assets/${asset.assetId}/download/`,
        key: asset.assetPath,
        dandisetId: userDandisetId,
        recordWorkspace: (workspaceId: number) => dandisets.recordWorkspace(userDandisetId, workspaceId, protocol),
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

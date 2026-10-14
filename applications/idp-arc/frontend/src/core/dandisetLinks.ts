/**
 * What an IDP dandiset is for, recorded in its own EMBER-DANDI metadata: the protocol it holds
 * data for, and the OSB workspace that data runs in. Choosing a protocol in the upload dialog lists
 * the researcher's dandisets for that protocol, and picking one picks its workspace too.
 *
 * Both are `relatedResource` entries rather than custom top-level fields: DANDI's schema already
 * defines that field, so the draft stays valid and publishable. An entry is ours when its
 * `identifier` starts with one of the prefixes below. The workspace's carries the OSB domain,
 * because workspace ids don't carry across OSB environments: a dev link must never match on prod.
 */

/** A dandiset's draft metadata document, exactly as EMBER returns it. Written back whole. */
export type DandisetMetadata = Record<string, unknown>

const PROTOCOL_PREFIX = 'idp-protocol:'
const WORKSPACE_PREFIX = 'osb-workspace'

interface Resource {
  identifier?: unknown
  [key: string]: unknown
}

function resources(metadata: DandisetMetadata): Resource[] {
  const r = metadata.relatedResource
  return Array.isArray(r) ? (r as Resource[]) : []
}

/** The identifier of the first entry starting with `prefix`, without the prefix. */
function linked(metadata: DandisetMetadata, prefix: string): string | undefined {
  for (const r of resources(metadata)) {
    if (typeof r.identifier === 'string' && r.identifier.startsWith(prefix)) return r.identifier.slice(prefix.length)
  }
  return undefined
}

/** `metadata` with `entry` replacing any earlier entry under `prefix`; other resources untouched. */
function withEntry(metadata: DandisetMetadata, prefix: string, entry: Resource): DandisetMetadata {
  const others = resources(metadata).filter((r) => !(typeof r.identifier === 'string' && r.identifier.startsWith(prefix)))
  return { ...metadata, relatedResource: [...others, entry] }
}

function workspacePrefix(osbDomain: string): string {
  return `${WORKSPACE_PREFIX}:${osbDomain}:`
}

/** The protocol (its stable id in protocols.json) this dandiset holds data for, if recorded. */
export function readProtocolLink(metadata: DandisetMetadata): string | undefined {
  return linked(metadata, PROTOCOL_PREFIX) || undefined
}

/** The OSB workspace (in `osbDomain`) this dandiset's data runs in, if recorded. */
export function readWorkspaceLink(metadata: DandisetMetadata, osbDomain: string): number | undefined {
  const id = Number(linked(metadata, workspacePrefix(osbDomain)))
  return Number.isInteger(id) && id > 0 ? id : undefined
}

export function withProtocolLink(
  metadata: DandisetMetadata,
  protocol: { id: string; name: string; url?: string },
): DandisetMetadata {
  return withEntry(metadata, PROTOCOL_PREFIX, {
    schemaKey: 'Resource',
    identifier: `${PROTOCOL_PREFIX}${protocol.id}`,
    name: `IDP protocol: ${protocol.name}`,
    ...(protocol.url ? { url: protocol.url } : {}),
    relation: 'dcite:IsDescribedBy',
  })
}

export function withWorkspaceLink(
  metadata: DandisetMetadata,
  osbDomain: string,
  workspaceId: number,
  workspaceUrl: string,
): DandisetMetadata {
  const prefix = workspacePrefix(osbDomain)
  return withEntry(metadata, prefix, {
    schemaKey: 'Resource',
    identifier: `${prefix}${workspaceId}`,
    name: `Open Source Brain workspace ${workspaceId}`,
    url: workspaceUrl,
    relation: 'dcite:IsReferencedBy',
  })
}

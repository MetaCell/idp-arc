/** The DANDI deployments the app can use, by the name OSB and dandi-cli know them by. */
export const DANDI_INSTANCES = {
  'dandi': { api: 'https://api.dandiarchive.org', web: 'https://dandiarchive.org' },
  'dandi-sandbox': { api: 'https://api.sandbox.dandiarchive.org', web: 'https://sandbox.dandiarchive.org' },
  'ember-dandi': { api: 'https://api-dandi.emberarchive.org', web: 'https://dandi.emberarchive.org' },
  'ember-dandi-sandbox': { api: 'https://api-dandi.sandbox.emberarchive.org', web: 'https://dandi.sandbox.emberarchive.org' },
} as const

export type DandiInstanceName = keyof typeof DANDI_INSTANCES

export const DEFAULT_DANDI_INSTANCE: DandiInstanceName = 'ember-dandi'

export interface DandiInstance {
  name: DandiInstanceName
  /** The API's origin, and the web UI's. */
  api: string
  web: string
}

export const isDandiInstanceName = (name: string): name is DandiInstanceName => Object.hasOwn(DANDI_INSTANCES, name)

/** The instance VITE_DANDI_INSTANCE names; EMBER-DANDI when it is empty. Throws for any other name. */
export function dandiInstance(configured?: string): DandiInstance {
  const name = (configured ?? '').trim() || DEFAULT_DANDI_INSTANCE
  if (!isDandiInstanceName(name)) {
    throw new Error(`VITE_DANDI_INSTANCE "${name}" is not a DANDI instance; use one of: ${Object.keys(DANDI_INSTANCES).join(', ')}.`)
  }
  return { name, ...DANDI_INSTANCES[name] }
}

/** The protocol's MAABCD dandiset on `instance` (protocols.json `maabcdAggregateDandisets`);
 *  undefined when it has none there. */
export function maabcdDandisetFor(
  protocol: { maabcdAggregateDandisets?: Readonly<Record<string, string>> },
  instance: DandiInstanceName,
): string | undefined {
  return protocol.maabcdAggregateDandisets?.[instance] || undefined
}

import { useEffect, useState } from 'react'
import { convertToBids, type BidsConfig, type BidsConversion } from '../core/bids/convert'

export interface BidsCheck {
  /** The file is being read and converted. */
  checking: boolean
  /** The conversion of the current file, or null when there is nothing to check. */
  result: BidsConversion | null
}

interface Done {
  file: File
  config: BidsConfig
  datasetName: string
  result: BidsConversion
}

/** Converts the picked file to BIDS as soon as it is picked, so its problems show before upload. */
export function useBidsCheck(file: File | null, config: BidsConfig | undefined, datasetName: string): BidsCheck {
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    if (!file || !config) return
    let current = true
    convertToBids(file, config, { name: datasetName, protocol: { name: datasetName } })
      .catch((): BidsConversion => ({ files: [], subjects: [], problems: [{ level: 'error', message: `${file.name} could not be read.` }] }))
      .then((result) => { if (current) setDone({ file, config, datasetName, result }) })
    return () => { current = false }
  }, [file, config, datasetName])

  if (!file || !config) return { checking: false, result: null }
  // Still converting until the result is for exactly this file and settings.
  if (done?.file !== file || done.config !== config || done.datasetName !== datasetName) return { checking: true, result: null }
  return { checking: false, result: done.result }
}

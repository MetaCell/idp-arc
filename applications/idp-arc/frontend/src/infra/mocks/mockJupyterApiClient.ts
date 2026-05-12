import type { IJupyterApi } from '../../core/ports/IJupyterApi'

/**
 * MockJupyterApiClient — in-memory stub for IJupyterApi.
 *
 * • triggerSpawn()   logs and returns immediately
 * • waitUntilReady() simulates a 1-second "boot" then resolves true
 * • uploadFile()     logs and resolves immediately
 */
export class MockJupyterApiClient implements IJupyterApi {
  async triggerSpawn(_token: string, userId: string, serverName: string): Promise<void> {
    console.info(
      `[MockJupyterApiClient] triggerSpawn(userId="${userId}", serverName="${serverName}")`,
    )
  }

  async waitUntilReady(
    userId: string,
    serverName: string,
    _deadlineMs: number,
    abortRef: { current: boolean },
  ): Promise<boolean> {
    console.info(
      `[MockJupyterApiClient] waitUntilReady(userId="${userId}", serverName="${serverName}") — simulating 1 s boot…`,
    )
    const BOOT_MS = 1_000
    const POLL_MS = 200
    const steps = BOOT_MS / POLL_MS

    for (let i = 0; i < steps; i++) {
      if (abortRef.current) {
        console.info('[MockJupyterApiClient] waitUntilReady() aborted')
        return false
      }
      await delay(POLL_MS)
    }

    console.info('[MockJupyterApiClient] waitUntilReady() → ready')
    return true
  }

  async uploadFile(userId: string, serverName: string, file: File): Promise<void> {
    await delay(500)
    console.info(
      `[MockJupyterApiClient] uploadFile(userId="${userId}", serverName="${serverName}", file="${file.name}")`,
    )
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

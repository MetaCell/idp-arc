/**
 * IJupyterApi — abstraction over the JupyterHub / JupyterLab interaction.
 *
 * DIP rule: use-cases never import the browser's `fetch`, `document.cookie`, or
 * `window.open` directly. All platform side-effects go here so they can be
 * swapped or faked in unit tests.
 */
export interface IJupyterApi {
  /**
   * Sets the session cookie required by JupyterHub and fires the spawn trigger.
   * @param token      Current access token.
   * @param userId     Subject claim from the token (used in hub URL).
   * @param serverName Named-server identifier (e.g. `"42lab"`).
   */
  triggerSpawn(token: string, userId: string, serverName: string): Promise<void>

  /**
   * Sets the session cookie required by JupyterHub and fires the spawn trigger.
   * deadline is exceeded.
   * @returns `true` if the server is ready, `false` if timed-out or aborted.
   */
  waitUntilReady(
    userId: string,
    serverName: string,
    deadlineMs: number,
    abortRef: { current: boolean },
  ): Promise<boolean>

  /**
   * Uploads a file using the JupyterLab Contents API (PUT, base64-encoded).
   */
  uploadFile(userId: string, serverName: string, file: File): Promise<void>
}

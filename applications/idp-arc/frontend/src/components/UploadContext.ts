/**
 * Module-level upload trigger.
 *
 * PageLayout registers the real opener (which checks auth and shows the dialog).
 * Any page component — including ones that render PageLayout and therefore can
 * never be *inside* a context Provider it creates — can call openUpload() to
 * trigger the dialog or login flow.
 */
let _opener: (protocolName?: string) => void = () => {}

export const registerUploadOpener = (fn: (protocolName?: string) => void) => { _opener = fn }
/** Opens the upload dialog (or the Login dialog when a login is missing); `protocolName`
 *  preselects that protocol in it. */
export const openUpload = (protocolName?: string) => _opener(protocolName)

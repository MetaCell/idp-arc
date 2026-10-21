/**
 * Module-level upload trigger.
 *
 * PageLayout registers the real opener (which checks auth and shows the dialog).
 * Any page component — including ones that render PageLayout and therefore can
 * never be *inside* a context Provider it creates — can call openUpload() to
 * trigger the dialog or login flow.
 */
let _opener: () => void = () => {}

export const registerUploadOpener = (fn: () => void) => { _opener = fn }
export const openUpload = () => _opener()

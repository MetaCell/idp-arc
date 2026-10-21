# Protocols (`protocols.json`)

One entry per behavioral task / protocol. It drives the Protocols page and the upload dialog, and
it tells IDP which analysis to run on a researcher's data and what input that analysis can read.
Field names follow the MAABCD–OSB Integration design (`id`, `repoZipUrl`, `notebooksDir`).

## Fields

| Field | Used by | Meaning |
|---|---|---|
| `id` | run | **Stable id, never derived from the name** (`four-choice-reversal`). Tags the workspace (`maabcd:<id>`), prefixes the upload in the bucket and names the workspace folder its runs go in (`<id>/run-<id>-<UTC timestamp>/`). Don't change it once uploads exist. |
| `name` | everywhere | Display name. Free to edit. |
| `description`, `imageUrl`, `videoUrl` | Protocols page | Text and media shown for the protocol. |
| `repoZipUrl` | run | GitHub archive of the analysis repository, `https://codeload.github.com/<owner>/<repo>/zip/refs/heads/<branch>` (or `refs/tags/<tag>`, or `/zip/<commit>`). A **branch** follows the latest fixes; a **commit** freezes the code. An empty `repoZipUrl` = no analysis yet: the upload dialog doesn't offer the protocol. |
| `notebooksDir` | run | Repository-relative folder of the notebooks (`notebooks`). |
| `requirements`, `pythonPath`, `install` | run | Override the repository setup below (defaults in `REPOSITORY_SETUP`, runProtocol.ts: `requirements.txt`; `["scripts"]`; `["scripts/install.py", "scripts/setup.py", "scripts/pyproject.toml"]`). OSB applies only the ones the repository has. Leave them out for a repository that follows the contract. |
| `templatesZipUrl` | Protocols page, dialog | Archive of the protocol's templates (data sheets, instructions), downloaded by the **Download** buttons on the Protocols page and in the dialog's upload step. A path relative to `public/` (`protocols_archives/4c.zip`) or an absolute URL. Missing or empty = both buttons disabled. |
| `inputFormats` | dialog, run | Extensions the analysis code can actually read. The dialog refuses other files before anything starts. **Without it, any file is accepted** (except an empty one, always refused). |

## What happens on "Upload and run" (core/use-cases/runProtocol.ts)

The button stays disabled until a file is chosen, and while that file is empty or of a format the
protocol doesn't read.

1. The file goes from the browser straight to the bucket (`VITE_UPLOAD_BUCKET_URL`), as
   `uploads/<id>/<user>/<upload id>/<file>`. Once it has landed: the workspace (the selected one, or
   a new one tagged `maabcd:<id>`), then the repository import. No lab server is started; OSB's
   import and run tasks don't need one.
2. OSB imports both into this run's folder (`POST /workspaceresource`; names in
   core/workspaceLayout.ts): `<id>/run-<id>-<UTC timestamp>/<repo>-<ref>/` for the code, fresh for
   every run, and `…/inputs/` for the upload (a `.zip` is unpacked there).
3. When the imports are done, IDP lists the notebooks OSB found in `notebooksDir` and sorts them.
   It then asks OSB to run exactly those, in that order (`POST /workspace/{id}/run`, papermill in
   an Argo task), with the run's `inputs/` and `outputs/` as the notebooks' `INPUT_DIR` and
   `OUTPUT_DIR` parameters. OSB sets up `requirements.txt` and `scripts/` first; which notebooks run
   and where they read and write is IDP's decision.
4. Results, in the same run folder (e.g. `four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/`):
   `inputs/` (the upload), `outputs/` (what the notebooks wrote), the executed notebooks and `run.log`. The
   run task removes the code once it has copied it, so the next run gets the current code.
5. **Success or failure.** The run task writes the executed notebooks to `notebooks.running/` and
   renames that folder once, at the end: to `notebooks/` if every notebook passed, to
   `notebooks.failed/` if one failed (it holds the ones that ran, the failed one last; later ones
   never ran). So `notebooks/` exists only after a fully successful run. The run's workflow ends
   with OSB's scan whatever the outcome, so once OSB's placeholder (id -1) is gone, the listing
   says how it went: every executed notebook in `notebooks/` = success; anything in
   `notebooks.failed/` = failure; neither
   (re-checked for 15 s, as the scan reports through an event queue) = it stopped before any
   notebook ran (e.g. installing the requirements). The cause is in `run.log`.
   `outputs/` is written either way, so after a failure it may hold partial results.

## What a protocol repository must look like

Agreed with the protocol authors on 30 Sep 2026. These conventions live in IDP (`REPOSITORY_SETUP`
and `notebooksDir`): IDP tells OSB which notebooks to run, in what order, and which setup files to
use; OSB uses the ones the repository has and assumes nothing else.

1. `requirements.txt` at the root — **optional**, installed first. Pin versions: the task image
   pre-installs pandas, numpy, openpyxl and matplotlib, and an unpinned requirement is satisfied by
   whatever version that is (four-choice broke on matplotlib 3.11, which removed `boxplot(labels=)`).
2. `scripts/` — **optional**: `scripts/install.py` is run if present, else it's pip-installed if it
   is a package (`setup.py`/`pyproject.toml`); it's always on `PYTHONPATH`. A failure here doesn't
   stop the run.
3. `notebooks/` — **required**. Every visible `*.ipynb` directly in it runs, one after another, in
   byte order of the file name (**zero-pad the numbers**: `01_…`, `02_…`; `10_x` sorts before
   `2_x`), each with its own folder as working directory. The first failing notebook stops the run.
4. **Input and output: a cell tagged `parameters`** (papermill's convention) in every notebook, setting
   `INPUT_DIR` and `OUTPUT_DIR` to its own defaults (e.g. its example data). The notebooks read from
   `INPUT_DIR` and write everything they produce to `OUTPUT_DIR`; for a run, IDP passes the run's
   `inputs/` and `outputs/`. A notebook without that cell isn't run.

## Per protocol

### Four-choice reversal digging task — `maracbaylis/four-choice-example`

- **Accepted: `.xlsx`, `.zip`.**
  - `.xlsx`: one filled **ARC Four Choice TABS workbook** (one animal, 6–8 sheets). Google Sheets:
    *File → Download → Microsoft Excel (.xlsx)*.
  - `.zip`: several such workbooks (e.g. one per animal), analysed together; files at the top level
    or inside one folder (what Finder/Explorer "Compress" makes).
- **Not accepted: `.csv`, `.tsv`, `.xls`, `.ods`**: the pipeline only reads `*.xlsx` with openpyxl.
- **Needs a `parameters` cell (not there yet):** its notebooks set `INPUT_DIR` / `OUTDIR` in their
  first cell without the tag, and 02/03 call `example_input_dir()` again. Until that cell is tagged
  and used (asked of the authors, 5 Oct 2026), runs stop with "has no cell tagged parameters".
- **One workbook is one animal:** PCA and the group figures need at least two.
- **Without an upload** (not offered by the dialog) the notebooks run on the repository's own 11
  example workbooks.
- Verified 2 Oct 2026 with the task image in Docker: all three notebooks in ~9 s on one workbook.

### Two arm bandit, ASST digging

No analysis repository yet (`repoZipUrl` is empty): they are shown on the site, but the upload
dialog doesn't offer them. When a repository exists, fill in `repoZipUrl` and add `notebooksDir`
and — after checking what its code reads — `inputFormats`.

## Adding or changing a protocol

1. Check what the analysis code really reads (file types, single file vs folder, where it looks)
   and set `inputFormats` to match, and check its notebooks have the `parameters` cell — don't list formats the code ignores; researchers
   would only find out minutes into a run.
2. Run it once from the dialog with the sample file.

Tunable timings of the run (time limits, polling) are in `../core/runSettings.ts`, not here.

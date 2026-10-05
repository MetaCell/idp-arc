# Protocols (`protocols.json`)

One entry per behavioral task / protocol. It drives the Protocols page and the upload dialog, and
it tells IDP which analysis to run on a researcher's data and what input that analysis can read.
Field names follow the MAABCD–OSB Integration design (`id`, `repoZipUrl`, `notebooksDir`).

## Fields

| Field | Used by | Meaning |
|---|---|---|
| `id` | run | **Stable id, never derived from the name** (`four-choice-reversal`). Tags the workspace (`maabcd:<id>`), prefixes the upload in the bucket and names each run's results folder (`results/run-<id>-<UTC timestamp>/`). Don't change it once uploads exist. |
| `name` | everywhere | Display name. Free to edit. |
| `description`, `imageUrl`, `videoUrl` | Protocols page | Text and media shown for the protocol. |
| `repoZipUrl` | run | GitHub archive of the analysis repository, `https://codeload.github.com/<owner>/<repo>/zip/refs/heads/<branch>` (or `refs/tags/<tag>`, or `/zip/<commit>`). A **branch** follows the latest fixes; a **commit** freezes the code. No `repoZipUrl` = no analysis yet: the run stops with "has no analysis repository configured yet". |
| `notebooksDir` | run | Repository-relative folder of the notebooks (`notebooks`). |
| `inputDir` | run | Repository folder the notebooks read their input from (four-choice: `example_data`). For a run with an upload it holds the upload instead, in the run's scratch copy of the repository, so the notebooks run unchanged. Required for a protocol that takes an upload. |
| `outputs` | run | Repository folders whose contents are the run's results (four-choice: `["outputs"]`). Emptied in the run's scratch copy before the notebooks run (so example results committed there don't pass for the run's) and copied into the results folder afterwards, also when the run fails. Anything the notebooks write elsewhere is not kept. |
| `requirements`, `pythonPath`, `install` | run | Override the repository setup below (defaults in `REPOSITORY_SETUP`, runProtocol.ts: `requirements.txt`; `["scripts"]`; `["scripts/install.py", "scripts/setup.py", "scripts/pyproject.toml"]`). OSB applies only the ones the repository has. Leave them out for a repository that follows the contract. |
| `inputFormats` | dialog, run | Extensions the analysis code can actually read. The dialog refuses other files before anything starts. **Without it, any file is accepted.** |

## What happens on "Upload and run" (core/use-cases/runProtocol.ts)

1. The file goes from the browser straight to the bucket (`VITE_UPLOAD_BUCKET_URL`), as
   `uploads/<id>/<user>/<upload id>/<file>`. Once it has landed: the workspace (the selected one, or
   a new one tagged `maabcd:<id>`), then the repository import. No lab server is started; OSB's
   import and run tasks don't need one.
2. OSB imports both into the workspace (`POST /workspaceresource`), each in this run's folder:
   `idp/<upload id>/repo/<repo>-<ref>/` and `idp/<upload id>/data/` (a `.zip` is unpacked there).
3. When the imports are done, IDP lists the notebooks OSB found in `notebooksDir` and sorts them.
   It then asks OSB to run exactly those, in that order (`POST /workspace/{id}/run`, papermill in
   an Argo task), with the input in `inputDir` and `outputs` as the results. OSB sets up
   `requirements.txt` and `scripts/` first; which notebooks run and which folders are the outputs is IDP's decision.
4. Results: `results/run-<id>-<UTC timestamp>/` in the workspace (e.g.
   `results/run-four-choice-reversal-2026-10-05T04-01-12Z/`) — the executed notebooks, the `outputs`
   folders, and `run.log`.

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
4. Outputs: the notebooks write under the repository's **`outputs/`** folder (the `outputs` field); each run's
   copy is saved to its results folder.

## Per protocol

### Four-choice reversal digging task — `maracbaylis/four-choice-example`

- **Accepted: `.xlsx`, `.zip`.**
  - `.xlsx`: one filled **ARC Four Choice TABS workbook** (one animal, 6–8 sheets). Google Sheets:
    *File → Download → Microsoft Excel (.xlsx)*.
  - `.zip`: several such workbooks (e.g. one per animal), analysed together; files at the top level
    or inside one folder (what Finder/Explorer "Compress" makes).
- **Not accepted: `.csv`, `.tsv`, `.xls`, `.ods`**: the pipeline only reads `*.xlsx` with openpyxl.
- **How the upload reaches the notebooks:** they read `example_input_dir()` = the repository's
  `example_data/`, so `inputDir` is `example_data`. Proposed: an `input/` folder the notebooks
  read when it exists (falling back to `example_data/`), so an upload isn't placed in a folder named
  "example"; switch `inputDir` to `input` only once the repository reads it.
- **One workbook is one animal:** PCA and the group figures need at least two.
- **Without an upload** the notebooks run on the repository's own 11 example workbooks.
- Verified 2 Oct 2026 with the task image in Docker: all three notebooks in ~9 s on one workbook.

### Two arm bandit, ASST digging, Open field, Elevated plus maze, Foraging

No analysis repository yet: they can be selected and shown, but not run. When a repository exists,
add `repoZipUrl`, `notebooksDir` and — after checking what its code reads — `inputFormats` (and
`inputDir` if its notebooks read a fixed folder).

## Adding or changing a protocol

1. Check what the analysis code really reads (file types, single file vs folder, where it looks)
   and set `inputFormats` / `inputDir` to match — don't list formats the code ignores; researchers
   would only find out minutes into a run.
2. Run it once from the dialog with the sample file and once with no file.

Tunable timings of the run (time limits, polling) are in `../core/runSettings.ts`, not here.

## 1. Inventory and freeze the moving set

- [x] 1.1 Produce the exact move manifest (source path → target path) for all 46 files plus the one rename, and record the group counts (feedback 20, plans 6, exploration 10, notes 5, out-of-scope 5, rename 1); verify the manifest covers 68 files in total when combined with the 21 files that keep their original path
- [x] 1.2 Record the frozen "stays in place" list — `COMPATIBILITY.md`, `GIT-WORKFLOW.md`, `GITHUB-GUARD.md`, `l0-contract.md`, `UPSTREAM-FOLLOWUPS.md`, `task-report/dev-1..8/`, `evaluation-reports/` — and verify each entry still exists at its original path after every later task

## 2. Archive the historical groups

- [x] 2.1 Create `docs/archive/2026-09/{feedback,plans,exploration,notes,out-of-scope}/` and verify the five directories exist and are empty before moving
- [x] 2.2 Move `docs/feedback/**` (20 files) into `docs/archive/2026-09/feedback/` with `git mv`, preserving the `26-09-02` / `26-09-04` / `26-09-07` subdirectory structure; verify `git status` reports renames rather than deletions plus additions
- [x] 2.3 Move `docs/plans/**` (6 files) into `docs/archive/2026-09/plans/` with `git mv`; verify the six plan files are present and `docs/plans/` no longer exists
- [x] 2.4 Move the 10 loose exploration documents from the `docs/` root into `docs/archive/2026-09/exploration/` with `git mv`; verify the `docs/` root no longer contains any of them
- [x] 2.5 Move the 5 note files into `docs/archive/2026-09/notes/` with `git mv`; verify `docs/notes/` no longer exists
- [x] 2.6 Move `docs/notes/pi-创作Agent平台架构方案.md` together with `docs/notes/assets/` (4 images) into `docs/archive/2026-09/out-of-scope/`, keeping the document and `assets/` in the same directory; verify the four relative `assets/*.png` links in that document still resolve on disk

## 3. Resolve the name collision

- [x] 3.1 Rename `docs/GUIDE.md` to `docs/RECOVERY.md` with `git mv`; verify the new path exists, the old path does not, and the file content is unchanged (same blob hash)
- [x] 3.2 Update the one live reference in `TROUBLESHOOTING.md` that points at `docs/GUIDE.md`, and confirm no other live document still points at the old name; verify by grepping every non-archived Markdown file outside `docs/archive/`, `.pi/fast-fixes/`, `docs/task-report/` and `openspec/changes/archive/` for `docs/GUIDE.md`

## 4. Index and cleanup

- [x] 4.1 Write `docs/README.md` containing the current authoritative entries and their purpose, the `archive/2026-09/` groups and what each one is, the supersession relationships (for example `plan-note-01/02` superseded by `plan-note-03/04`; `docs/GUIDE.md` renamed to `RECOVERY.md`), and the full old-path-to-new-path mapping table; verify a reader can find any archived file from its old path using only this file
- [x] 4.2 Remove the empty `docs/archived/` directory; verify it is gone and nothing was inside it
- [x] 4.3 Verify the frozen "stays in place" list from task 1.2 is intact and that the `docs/` root now contains only the authoritative entries, `README.md`, and directories
- [x] 4.4 Confirm zero deletions: verify `git diff --cached --diff-filter=D --name-only` and `git log -1 --diff-filter=D --name-only` report no deleted paths for this change

## 5. Acceptance

- [x] 5.1 Resolve every live reference to a `docs/` path from the repository root, `src/`, `openspec/specs/` and `openspec/changes/` (excluding the archived changes) and verify each target file exists; record the list and the result
- [x] 5.2 Run `pnpm typecheck`, `pnpm -w run lint` and `pnpm test`, and record the results; verify all three exit 0
- [x] 5.3 Write the per-task-group report required by `AGENTS.md` section 7 into `docs/task-report/dev-<next-id>/`, stating purpose, effect, characteristics and boundaries for each `##` group; verify the file exists and covers all four elements
- [x] 5.4 Record the complete move manifest in the change commit message so `git log --follow` users can trace a moved file without opening the index; verify the message lists every source-to-target mapping

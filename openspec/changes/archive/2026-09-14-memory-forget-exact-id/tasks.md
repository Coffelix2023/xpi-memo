## 1. Prerequisite: repository gate

- [x] 1.1 Remove the artifact that makes `pnpm -w run lint` fail by adding `.pi/reports/**` to the Biome ignore list (or removing the tracked generated report), and verify `pnpm -w run lint` exits 0
- [x] 1.2 Run `pnpm typecheck` and `pnpm test` on the untouched baseline and record the observed pass counts, so later failures are attributable to this change

## 2. Upstream capability and adapter change

- [x] 2.1 Re-verify the installed Mnemosyne CLI capability set against its `COMMANDS` dictionary and `Memory` API, and record which signals the probe may use (subcommand presence, output parseability); verify the record names concrete file paths and that it matches the new requirements in `specs/memory-operation-closure/spec.md`
- [x] 2.2 Implement the exact-ID capability probe in the adapter layer with a per-process cache, returning "unavailable" for both a missing capability and an unparseable result; verify unit tests cover present-and-parseable, present-but-unparseable, and absent
- [x] 2.3 Make `forget` call the backend delete directly when the capability is unavailable, preserving project-bank-then-default-bank order and stopping after the first success; verify mocked-backend tests cover project hit, project miss falling back to default, and absent in every bank
- [x] 2.4 Keep the recovery-before-delete path when the capability is available and ensure a failed recovery write still prevents the delete call; verify the existing recovery tests stay green plus one new assertion that delete was not invoked

## 3. Result, audit and diagnostic semantics

- [x] 3.1 Make the tool result state "no recovery written" explicitly when the capability is unavailable, and return `status: deleted` with bank and memory ID on success; verify an integration test asserts the three result shapes and their fields
- [x] 3.2 Keep audit recording `memory-deleted-by-user` only after a successful deletion, including the actual bank; verify a test reading `audit.json` asserts the success and failure record sets
- [x] 3.3 Expose the capability verdict through status or doctor diagnostics without memory bodies; verify a status output test asserts the field exists and contains no body text

## 4. Documentation and acceptance

- [x] 4.1 Update the `Forget fails closed` section in `TROUBLESHOOTING.md` and the recovery section of `docs/GUIDE.md` to the capability-split wording; verify both describe the same behavior as the delta spec and promise no nonexistent upstream command
- [x] 4.2 Record the follow-up request for an upstream exact-ID read command in the designated documentation location; verify the entry exists and is explicitly marked as out of scope for this change
- [x] 4.3 Run `pnpm typecheck`, `pnpm -w run lint` and `pnpm test`, and record the results; verify all three exit 0
- [x] 4.4 Write the per-task-group report required by `AGENTS.md` section 7 into `docs/task-report/dev-<next-id>/`, stating purpose, effect, characteristics and boundaries for each `##` group; verify the file exists and covers all four elements

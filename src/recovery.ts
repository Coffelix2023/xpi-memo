import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GetMemoryByIdResult } from "./operations.ts";

export interface MemoryRecoveryRecord {
  deletedAt: string;
  memory: GetMemoryByIdResult;
  recoveryId: string;
  version: 1;
}

/** Persist a private, manual-recovery copy before deleting a T1 memory. */
export function writeMemoryRecovery(
  dataDir: string,
  memory: GetMemoryByIdResult,
  now = new Date(),
): MemoryRecoveryRecord {
  const deletedAt = now.toISOString();
  const baseId = `${encodeURIComponent(memory.id)}-${deletedAt.replaceAll(":", "-")}`;
  const recoveryDir = join(dataDir, "recovery");
  mkdirSync(recoveryDir, {
    mode: 0o700,
    recursive: true,
  });
  for (let attempt = 0; ; attempt += 1) {
    const recoveryId = attempt === 0 ? baseId : `${baseId}-${attempt}`;
    const record: MemoryRecoveryRecord = {
      deletedAt,
      memory,
      recoveryId,
      version: 1,
    };
    try {
      writeFileSync(
        join(recoveryDir, `${recoveryId}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
        {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        },
      );
      return record;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST")
        continue;
      throw error;
    }
  }
}

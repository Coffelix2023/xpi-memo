import { existsSync, readFileSync } from "node:fs";
import { translateConfig } from "./config-migrator.js";

/** Read + translate a legacy config file without writing anything (dry-run preview). */
export function previewConfigTranslation(legacyPath: string): {
  renamedKeys: string[];
  ignoredKeys: string[];
} | null {
  if (!existsSync(legacyPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(legacyPath, "utf8"));
  } catch {
    return {
      ignoredKeys: [],
      renamedKeys: [],
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const result = translateConfig(parsed as Record<string, unknown>);
  return {
    ignoredKeys: result.ignoredKeys,
    renamedKeys: result.renamedKeys,
  };
}

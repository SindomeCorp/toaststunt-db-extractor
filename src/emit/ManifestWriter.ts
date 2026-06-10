import { stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DbHeader } from "../model/types.js";

export interface ManifestInput {
  snapshotId: string;
  sourcePath: string;
  outputDir: string;
  extractorVersion: string;
  startedAt: string;
  completedAt: string;
  header: DbHeader;
}

export async function writeManifest(input: ManifestInput): Promise<void> {
  const sourceStat = await stat(input.sourcePath);
  const manifest = {
    snapshotId: input.snapshotId,
    sourcePath: resolve(input.sourcePath),
    sourceSizeBytes: sourceStat.size,
    sourceMtime: sourceStat.mtime.toISOString(),
    extractorVersion: input.extractorVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    format: {
      server: "toaststunt",
      dbVersion: input.header.dbVersion
    }
  };
  await writeFile(join(input.outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

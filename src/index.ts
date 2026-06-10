import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtractResult,
  ExtractToastStuntDbOptions,
  InspectResult,
  NormalizedExtractOptions,
  ValidationResult
} from "./model/types.js";
import { JsonlWriter } from "./emit/JsonlWriter.js";
import { writeManifest } from "./emit/ManifestWriter.js";
import { VerbCodeWriter } from "./emit/VerbCodeWriter.js";
import { parseDatabase, looksLikeNativeToastStuntDatabase } from "./parser/parseDatabase.js";
import { extractNativeDatabaseToOutput } from "./parser/parseNativeDatabase.js";
import { inspectDatabase } from "./inspect/inspectDatabase.js";
import { validateToastStuntDbPath } from "./validate/validateExtraction.js";

export type {
  CoreCandidateRecord,
  EffectiveProperty,
  ExtractErrorSummary,
  ExtractProgressEvent,
  ExtractResult,
  ExtractStats,
  ExtractToastStuntDbOptions,
  InspectResult,
  ObjectRecord,
  PropertyDefinitionRecord,
  PropertyValueRecord,
  ToastMapEntry,
  ToastValue,
  ToastValueSummary,
  ValidationResult,
  VerbRecord
} from "./model/types.js";

export async function extractToastStuntDb(options: ExtractToastStuntDbOptions): Promise<ExtractResult> {
  const normalized = normalizeOptions(options);
  const startedAt = new Date().toISOString();
  if (normalized.overwrite) {
    await rm(normalized.outputDir, { recursive: true, force: true });
  }
  await mkdir(normalized.outputDir, { recursive: true });
  if (await looksLikeNativeToastStuntDatabase(normalized.inputPath)) {
    normalized.onProgress?.({ phase: "parse", message: "Streaming native ToastStunt database" });
    return extractNativeDatabaseToOutput(normalized, startedAt);
  }

  normalized.onProgress?.({ phase: "parse", message: "Parsing database" });
  const parsed = await parseDatabase(normalized);

  if (normalized.includeVerbCode) {
    const writer = new VerbCodeWriter(normalized.outputDir);
    const verbById = new Map(parsed.verbs.map((verb) => [verb.id, verb]));
    for (const program of parsed.programs) {
      const verb = verbById.get(`#${program.objectId}:${program.verbIndex}`);
      if (!verb) continue;
      const written = await writer.write(program.objectId, program.verbIndex, verb.primaryName, program.code);
      verb.codeHash = written.codeHash;
      verb.codeLineCount = written.codeLineCount;
      verb.sourcePath = written.sourcePath;
      verb.hasProgram = true;
      parsed.stats.verbCodeFilesWritten += 1;
    }
  }

  normalized.onProgress?.({ phase: "emit", message: "Writing extraction artifacts" });
  await writeJsonl(join(normalized.outputDir, "objects.jsonl"), parsed.objects, normalized.pretty);
  await writeJsonl(join(normalized.outputDir, "verbs.jsonl"), parsed.verbs, normalized.pretty);
  await writeJsonl(join(normalized.outputDir, "properties.jsonl"), parsed.properties, normalized.pretty);
  await writeJsonl(join(normalized.outputDir, "property_values.jsonl"), parsed.propertyValues, normalized.pretty);
  await writeJsonl(join(normalized.outputDir, "core_candidates.jsonl"), parsed.coreCandidates, normalized.pretty);
  await writeJsonl(join(normalized.outputDir, "errors.jsonl"), parsed.errors, normalized.pretty);
  await writeFile(join(normalized.outputDir, "stats.json"), `${JSON.stringify(parsed.stats, null, 2)}\n`, "utf8");
  await writeManifest({
    snapshotId: normalized.snapshotId,
    sourcePath: normalized.inputPath,
    outputDir: normalized.outputDir,
    extractorVersion: "0.1.0",
    startedAt,
    completedAt: new Date().toISOString(),
    header: parsed.header
  });

  return {
    snapshotId: normalized.snapshotId,
    outputDir: normalized.outputDir,
    stats: parsed.stats,
    errors: parsed.errors
  };
}

export async function inspectToastStuntDb(inputPath: string): Promise<InspectResult> {
  return inspectDatabase(inputPath);
}

export async function validateToastStuntDb(inputPath: string): Promise<ValidationResult> {
  return validateToastStuntDbPath(inputPath);
}

function normalizeOptions(options: ExtractToastStuntDbOptions): NormalizedExtractOptions {
  return {
    inputPath: options.inputPath,
    outputDir: options.outputDir,
    snapshotId: options.snapshotId ?? "latest",
    overwrite: options.overwrite ?? false,
    includeVerbCode: options.includeVerbCode ?? true,
    includePropertyValues: options.includePropertyValues ?? true,
    maxValueDepth: options.maxValueDepth ?? 64,
    maxStringBytes: options.maxStringBytes ?? 10 * 1024 * 1024,
    maxCollectionItems: options.maxCollectionItems ?? 100000,
    redactPasswordProperties: options.redactPasswordProperties ?? true,
    pretty: options.pretty ?? false,
    quiet: options.quiet ?? false,
    ...(options.onProgress ? { onProgress: options.onProgress } : {})
  };
}

async function writeJsonl<T>(path: string, records: T[], pretty: boolean): Promise<void> {
  const writer = new JsonlWriter<T>(path, pretty);
  for (const record of records) await writer.write(record);
  await writer.close();
}

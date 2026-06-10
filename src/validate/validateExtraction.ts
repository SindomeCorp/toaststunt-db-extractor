import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractErrorSummary, ExtractStats, ValidationResult } from "../model/types.js";
import { LineReader } from "../reader/LineReader.js";
import { parseDatabase } from "../parser/parseDatabase.js";

export async function validateToastStuntDbPath(path: string): Promise<ValidationResult> {
  const pathStat = await stat(path);
  if (pathStat.isDirectory()) {
    return validateExtraction(path);
  }
  return validateDatabaseFile(path);
}

async function validateDatabaseFile(inputPath: string): Promise<ValidationResult> {
  const parsed = await parseDatabase({
    inputPath,
    outputDir: "",
    snapshotId: "validation",
    overwrite: false,
    includeVerbCode: false,
    includePropertyValues: false,
    maxValueDepth: 64,
    maxStringBytes: 10 * 1024 * 1024,
    maxCollectionItems: 100000,
    redactPasswordProperties: true,
    pretty: false,
    quiet: true
  });
  const errors = parsed.errors.filter((error) => error.fatal);
  const warnings = parsed.errors.filter((error) => !error.fatal);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: parsed.stats
  };
}

export async function validateExtraction(outputDir: string): Promise<ValidationResult> {
  const errors: ExtractErrorSummary[] = [];
  const warnings: ExtractErrorSummary[] = [];
  let stats: ExtractStats | undefined;

  for (const file of [
    "manifest.json",
    "objects.jsonl",
    "verbs.jsonl",
    "properties.jsonl",
    "property_values.jsonl",
    "core_candidates.jsonl",
    "errors.jsonl",
    "stats.json"
  ]) {
    try {
      await access(join(outputDir, file));
    } catch {
      errors.push({ fatal: true, section: "validation", message: `Missing output file ${file}` });
    }
  }

  try {
    stats = JSON.parse(await readFile(join(outputDir, "stats.json"), "utf8")) as ExtractStats;
  } catch {
    errors.push({ fatal: true, section: "validation", message: "Unable to read stats.json" });
  }

  const objectIds = new Set<string>();
  const verbIds = new Set<string>();
  try {
    for await (const record of readJsonl(join(outputDir, "objects.jsonl"))) {
      if (objectIds.has(record.id)) errors.push({ fatal: true, section: "validation", message: `Duplicate object id ${record.id}` });
      objectIds.add(record.id);
    }
    for await (const record of readJsonl(join(outputDir, "verbs.jsonl"))) {
      if (verbIds.has(record.id)) errors.push({ fatal: true, section: "validation", message: `Duplicate verb id ${record.id}` });
      verbIds.add(record.id);
      if (record.hasProgram && record.sourcePath) {
        try {
          await access(join(outputDir, record.sourcePath));
        } catch {
          errors.push({ fatal: true, section: "validation", message: `Missing verb code file ${record.sourcePath}` });
        }
      }
    }
    for await (const record of readJsonl(join(outputDir, "property_values.jsonl"))) {
      if (record.name === "password" && !record.value.redacted) {
        errors.push({ fatal: true, section: "validation", message: "Password property was not redacted" });
      }
      if (record.name !== "password" && record.value.redacted) {
        errors.push({ fatal: true, section: "validation", message: `Non-password property ${record.name ?? "<unknown>"} was redacted` });
      }
    }
  } catch (error) {
    errors.push({ fatal: true, section: "validation", message: error instanceof Error ? error.message : String(error) });
  }

  return { valid: errors.length === 0, errors, warnings, ...(stats ? { stats } : {}) };
}

async function* readJsonl(path: string): AsyncGenerator<any> {
  const reader = new LineReader(path);
  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
    }
  } finally {
    reader.close();
  }
}

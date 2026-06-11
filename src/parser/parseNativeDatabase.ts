import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtractResult,
  ExtractErrorSummary,
  NormalizedExtractOptions,
  ObjectId,
  ObjectRecord,
  ParsedDatabase,
  PropertyDefinitionRecord,
  PropertyValueRecord,
  VerbRecord,
  CoreCandidateRecord
} from "../model/types.js";
import { JsonlWriter } from "../emit/JsonlWriter.js";
import { VerbCodeWriter } from "../emit/VerbCodeWriter.js";
import { writeManifest } from "../emit/ManifestWriter.js";
import { createEmptyStats, syncStatsCounters } from "../emit/StatsCollector.js";
import { decodeObjectFlags, isRecycled } from "../model/flags.js";
import { decodePermissions } from "../model/permissions.js";
import { decodePrepositions } from "../model/prepositions.js";
import { DbCursor } from "../reader/DbCursor.js";
import { LineReader } from "../reader/LineReader.js";
import { computeEffectiveProperties } from "./parseObjects.js";
import { parseNativeValue, skipNativeValue } from "./parseNativeValue.js";

interface NativePendingPropertyValue {
  objectId: number;
  propertyIndex: number;
  value: import("../model/types.js").ToastValueSummary;
  owner?: ObjectId;
  permissionsRaw?: number;
}

type NativeRawPropertyValueRecord = NativePendingPropertyValue;

export async function extractNativeDatabaseToOutput(
  options: NormalizedExtractOptions,
  startedAt: string
): Promise<ExtractResult> {
  const tempValuesPath = join(options.outputDir, ".property_values.raw.jsonl");
  const errors: ExtractErrorSummary[] = [];
  const stats = createEmptyStats();
  const objects: ObjectRecord[] = [];
  const verbs: VerbRecord[] = [];
  const properties: PropertyDefinitionRecord[] = [];
  const header = { dbVersion: "unknown", rawHeaderLines: [] as string[] };

  const objectWriter = new JsonlWriter<ObjectRecord>(join(options.outputDir, "objects.jsonl"), options.pretty);
  const propertyWriter = new JsonlWriter<PropertyDefinitionRecord>(join(options.outputDir, "properties.jsonl"), options.pretty);
  const rawPropertyValueWriter = new JsonlWriter<NativeRawPropertyValueRecord>(tempValuesPath, false);
  const emptyCoreWriter = new JsonlWriter<CoreCandidateRecord>(join(options.outputDir, "core_candidates.jsonl"), options.pretty);

  const reader = new LineReader(options.inputPath);
  const cursor = new DbCursor(reader);

  try {
    const headerLine = await cursor.nextLine("header");
    header.dbVersion = headerLine;
    header.rawHeaderLines = [headerLine];
    const playerCount = await cursor.readInt("header");
    for (let i = 0; i < playerCount; i += 1) await cursor.nextLine("header");

    const objectCount = await skipToObjectTable(cursor);
    for (let i = 0; i < objectCount; i += 1) {
      const parsed = await parseNativeObject(cursor, options);
      if (!parsed) continue;
      objects.push(parsed.object);
      verbs.push(...parsed.verbs);
      properties.push(...parsed.properties);
      await objectWriter.write(parsed.object);
      for (const property of parsed.properties) await propertyWriter.write(property);
      if (options.includePropertyValues) {
        for (const value of parsed.pendingValues) await rawPropertyValueWriter.write(value);
      }
      stats.objects += 1;
      stats.verbs += parsed.verbs.length;
      stats.properties += parsed.properties.length;
      stats.propertyValues += options.includePropertyValues ? parsed.pendingValues.length : 0;
      if (stats.objects % 10000 === 0) {
        options.onProgress?.({ phase: "objects", count: stats.objects });
      }
    }
    await objectWriter.close();
    await propertyWriter.close();
    await rawPropertyValueWriter.close();
    await emptyCoreWriter.close();

    await cursor.expectLine("0", "objects");
    const programmedVerbCount = await cursor.readInt("programmed_verbs");
    stats.programmedVerbs = programmedVerbCount;
    const verbById = new Map(verbs.map((verb) => [verb.id, verb]));
    const verbCodeWriter = new VerbCodeWriter(options.outputDir);

    for (let i = 0; i < programmedVerbCount; i += 1) {
      const programHeader = await cursor.nextLine("programmed_verbs");
      const line = cursor.lineNumber;
      const match = /^#(-?\d+):(\d+)$/.exec(programHeader);
      if (!match) throw new Error(`Invalid programmed verb header at line ${line}: ${programHeader}`);
      const codeLines: string[] = [];
      while (true) {
        const codeLine = await cursor.nextLine("programmed_verbs");
        if (codeLine === ".") break;
        codeLines.push(codeLine);
      }
      const objectId = Number.parseInt(match[1]!, 10);
      const verbIndex = Number.parseInt(match[2]!, 10);
      const key = `#${objectId}:${verbIndex}` as `#${number}:${number}`;
      const verb = verbById.get(key);
      if (!verb) {
        errors.push({
          fatal: false,
          section: "programmed_verbs",
          line,
          message: `Programmed verb ${key} had no matching verb metadata`,
          object: `#${objectId}` as ObjectId,
          verbIndex
        });
        continue;
      }
      verb.hasProgram = true;
      if (options.includeVerbCode) {
        const written = await verbCodeWriter.write(objectId, verbIndex, verb.primaryName ?? verb.names[0] ?? "verb", `${codeLines.join("\n")}\n`);
        verb.codeHash = written.codeHash;
        verb.codeLineCount = written.codeLineCount;
        verb.sourcePath = written.sourcePath;
        stats.verbCodeFilesWritten += 1;
      }
    }

    const verbWriter = new JsonlWriter<VerbRecord>(join(options.outputDir, "verbs.jsonl"), options.pretty);
    for (const verb of verbs) await verbWriter.write(verb);
    await verbWriter.close();

    if (options.includePropertyValues) {
      const valueStats = await materializeNativePropertyValuesToOutput(
        tempValuesPath,
        options,
        objects,
        properties
      );
      stats.coreCandidates = valueStats.coreCandidates;
      stats.passwordPropertiesRedacted = valueStats.passwordPropertiesRedacted;
    } else {
      await new JsonlWriter<PropertyValueRecord>(join(options.outputDir, "property_values.jsonl"), options.pretty).close();
    }

    stats.warnings = errors.filter((error) => !error.fatal).length;
    stats.errors = errors.filter((error) => error.fatal).length;
    syncStatsCounters(stats);
    await writeFinalArtifacts(options, startedAt, header, stats, errors);
    await rm(tempValuesPath, { force: true });

    return {
      snapshotId: options.snapshotId,
      outputDir: options.outputDir,
      stats,
      errors
    };
  } catch (error) {
    const fatal = {
      fatal: true,
      section: typeof error === "object" && error !== null && "section" in error ? String(error.section) : "database",
      line: typeof error === "object" && error !== null && "line" in error ? Number(error.line) : cursor.lineNumber,
      message: error instanceof Error ? error.message : String(error)
    };
    errors.push(fatal);
    stats.errors = 1;
    syncStatsCounters(stats);
    await closeQuietly(objectWriter);
    await closeQuietly(propertyWriter);
    await closeQuietly(rawPropertyValueWriter);
    await closeQuietly(emptyCoreWriter);
    await ensureEmptyOutputFiles(options);
    await writeFinalArtifacts(options, startedAt, header, stats, errors);
    return {
      snapshotId: options.snapshotId,
      outputDir: options.outputDir,
      stats,
      errors
    };
  } finally {
    reader.close();
  }
}

export async function parseNativeDatabase(options: NormalizedExtractOptions): Promise<ParsedDatabase> {
  const reader = new LineReader(options.inputPath);
  const cursor = new DbCursor(reader);
  const errors: ExtractErrorSummary[] = [];
  try {
    const headerLine = await cursor.nextLine("header");
    const playerCount = await cursor.readInt("header");
    for (let i = 0; i < playerCount; i += 1) await cursor.nextLine("header");

    const objectCount = await skipToObjectTable(cursor);

    const objects: ObjectRecord[] = [];
    const verbs: VerbRecord[] = [];
    const properties: PropertyDefinitionRecord[] = [];
    const pendingValues: NativePendingPropertyValue[] = [];

    for (let i = 0; i < objectCount; i += 1) {
      const parsed = await parseNativeObject(cursor, options);
      if (!parsed) continue;
      objects.push(parsed.object);
      verbs.push(...parsed.verbs);
      properties.push(...parsed.properties);
      pendingValues.push(...parsed.pendingValues);
    }

    await cursor.expectLine("0", "objects");
    const programmedVerbCount = await cursor.readInt("programmed_verbs");
    const programs = [];
    const verbById = new Map(verbs.map((verb) => [verb.id, verb]));
    for (let i = 0; i < programmedVerbCount; i += 1) {
      const header = await cursor.nextLine("programmed_verbs");
      const line = cursor.lineNumber;
      const match = /^#(-?\d+):(\d+)$/.exec(header);
      if (!match) throw new Error(`Invalid programmed verb header at line ${line}: ${header}`);
      const codeLines: string[] = [];
      while (true) {
        const codeLine = await cursor.nextLine("programmed_verbs");
        if (codeLine === ".") break;
        codeLines.push(codeLine);
      }
      const objectId = Number.parseInt(match[1]!, 10);
      const verbIndex = Number.parseInt(match[2]!, 10);
      const key = `#${objectId}:${verbIndex}`;
      const verb = verbById.get(key as `#${number}:${number}`);
      if (verb) {
        verb.hasProgram = true;
      } else {
        errors.push({
          fatal: false,
          section: "programmed_verbs",
          line,
          message: `Programmed verb ${key} had no matching verb metadata`,
          object: `#${objectId}` as ObjectId,
          verbIndex
        });
      }
      programs.push({ objectId, verbIndex, code: `${codeLines.join("\n")}\n`, line });
    }

    const objectTable = new Map(objects.map((object) => [object.objectId, object]));
    const propertyDefinitionsByObject = new Map<number, PropertyDefinitionRecord[]>();
    for (const property of properties) {
      const list = propertyDefinitionsByObject.get(property.objectId) ?? [];
      list.push(property);
      propertyDefinitionsByObject.set(property.objectId, list);
    }

    const propertyValues = options.includePropertyValues
      ? pendingValues.map((pending) => materializeNativePropertyValue(pending, objectTable, propertyDefinitionsByObject, options))
      : [];

    const coreCandidates: CoreCandidateRecord[] = propertyValues
      .filter((value) => value.object === "#0" && value.name)
      .flatMap<CoreCandidateRecord>((value) => {
        const name = value.name!;
        if (value.value.type === "object" && value.value.object) {
          return [{
            kind: "core_candidate" as const,
            symbol: `$${name}`,
            property: name,
            sourceObject: "#0" as const,
            target: value.value.object,
            confidence: "object-property-on-root" as const
          }];
        }
        const refs = value.value.objectRefs ?? [];
        if (refs.length > 0) {
          return [{
            kind: "core_collection_candidate" as const,
            symbol: `$${name}`,
            property: name,
            sourceObject: "#0" as const,
            objectRefs: refs,
            confidence: "collection-property-on-root" as const
          }];
        }
        return [];
      });

    const stats = createEmptyStats();
    stats.objects = objects.length;
    stats.verbs = verbs.length;
    stats.programmedVerbs = programs.length;
    stats.properties = properties.length;
    stats.propertyValues = propertyValues.length;
    stats.coreCandidates = coreCandidates.length;
    stats.passwordPropertiesRedacted = propertyValues.filter((value) => value.value.redacted).length;
    stats.warnings = errors.length;
    syncStatsCounters(stats);

    return {
      header: { dbVersion: headerLine, rawHeaderLines: [headerLine] },
      objects,
      verbs,
      properties,
      propertyValues,
      coreCandidates,
      programs,
      errors,
      stats
    };
  } catch (error) {
    return {
      header: { dbVersion: "unknown", rawHeaderLines: [] },
      objects: [],
      verbs: [],
      properties: [],
      propertyValues: [],
      coreCandidates: [],
      programs: [],
      errors: [{
        fatal: true,
        section: typeof error === "object" && error !== null && "section" in error ? String(error.section) : "database",
        line: typeof error === "object" && error !== null && "line" in error ? Number(error.line) : cursor.lineNumber,
        message: error instanceof Error ? error.message : String(error)
      }],
      stats: syncStatsCounters({ ...createEmptyStats(), errors: 1 })
    };
  } finally {
    reader.close();
  }
}

async function skipToObjectTable(cursor: DbCursor): Promise<number> {
  while (true) {
    const line = await cursor.peekLine("objects");
    if (/^\d+$/.test(line)) {
      const candidate = await cursor.nextLine("objects");
      const next = await cursor.peekLine("objects");
      if (next === "#0" || next === "#0 recycled") {
        return Number.parseInt(candidate, 10);
      }
      continue;
    }
    await cursor.nextLine("objects");
  }
}

async function parseNativeObject(cursor: DbCursor, options: NormalizedExtractOptions): Promise<{
  object: ObjectRecord;
  verbs: VerbRecord[];
  properties: PropertyDefinitionRecord[];
  pendingValues: NativePendingPropertyValue[];
} | null> {
  const idLine = await cursor.nextLine("objects");
  const recycled = /^#(-?\d+) recycled$/.exec(idLine);
  if (recycled) {
    const objectId = Number.parseInt(recycled[1]!, 10);
    return {
      object: {
        kind: "object",
        objectId,
        id: `#${objectId}` as ObjectId,
        name: "",
        owner: "#-1",
        location: "#-1",
        lastMove: 0,
        parents: [],
        children: [],
        contents: [],
        flagsRaw: 1024,
        flags: decodeObjectFlags(1024),
        verbCount: 0,
        propertyDefinitionCount: 0,
        propertyValueCount: 0,
        recycled: true
      },
      verbs: [],
      properties: [],
      pendingValues: []
    };
  }

  const idMatch = /^#(-?\d+)$/.exec(idLine);
  if (!idMatch) throw new Error(`Expected object id at line ${cursor.lineNumber}, got ${idLine}`);
  const objectId = Number.parseInt(idMatch[1]!, 10);
  const name = await cursor.nextLine("objects");
  const flagsRaw = await cursor.readInt("objects");
  const owner = toObjectId(await cursor.readInt("objects"));
  const location = (await parseNativeValue(cursor, options)).summary;
  const lastMove = (await parseNativeValue(cursor, options)).summary;
  const contents = objectRefsFromSummary((await parseNativeValue(cursor, options)).summary);
  const parents = objectRefsFromSummary((await parseNativeValue(cursor, options)).summary);
  const children = objectRefsFromSummary((await parseNativeValue(cursor, options)).summary);

  const verbCount = await cursor.readInt("objects");
  const verbs: VerbRecord[] = [];
  for (let i = 0; i < verbCount; i += 1) {
    const namesRaw = await cursor.nextLine("objects");
    const verbOwner = toObjectId(await cursor.readInt("objects"));
    const permissionsRaw = await cursor.readInt("objects");
    const prepositionsRaw = await cursor.readInt("objects");
    const names = namesRaw.split(/\s+/).filter(Boolean);
    verbs.push({
      kind: "verb",
      id: `#${objectId}:${i}`,
      objectId,
      object: `#${objectId}`,
      verbIndex: i,
      namesRaw,
      names,
      primaryName: names[0] ?? `verb_${i}`,
      owner: verbOwner,
      permissionsRaw,
      permissions: decodePermissions(permissionsRaw),
      prepositionsRaw,
      prepositions: decodePrepositions(prepositionsRaw),
      hasProgram: false
    });
  }

  const propertyDefinitionCount = await cursor.readInt("objects");
  const properties: PropertyDefinitionRecord[] = [];
  for (let i = 0; i < propertyDefinitionCount; i += 1) {
    const propertyName = await cursor.nextLine("objects");
    properties.push({
      kind: "property_definition",
      id: `#${objectId}.${propertyName}`,
      objectId,
      object: `#${objectId}`,
      name: propertyName,
      definitionIndex: i
    });
  }

  const propertyValueCount = await cursor.readInt("objects");
  const pendingValues: NativePendingPropertyValue[] = [];
  for (let i = 0; i < propertyValueCount; i += 1) {
    if (!options.includePropertyValues) {
      await skipNativeValue(cursor);
      await cursor.nextLine("objects");
      await cursor.nextLine("objects");
      continue;
    }
    const parsed = await parseNativeValue(cursor, options);
    pendingValues.push({
      objectId,
      propertyIndex: i,
      value: parsed.summary,
      owner: toObjectId(await cursor.readInt("objects")),
      permissionsRaw: await cursor.readInt("objects")
    });
  }

  return {
    object: {
      kind: "object",
      objectId,
      id: `#${objectId}`,
      name,
      owner,
      location: firstObjectRef(location) ?? "#-1",
      lastMove: typeof lastMove.value === "number" ? lastMove.value : 0,
      parents,
      children,
      contents,
      flagsRaw,
      flags: decodeObjectFlags(flagsRaw),
      verbCount,
      propertyDefinitionCount,
      propertyValueCount,
      recycled: isRecycled(flagsRaw)
    },
    verbs,
    properties,
    pendingValues
  };
}

function materializeNativePropertyValue(
  pending: NativePendingPropertyValue,
  objectTable: Map<number, ObjectRecord>,
  propertyDefinitionsByObject: Map<number, PropertyDefinitionRecord[]>,
  options: NormalizedExtractOptions
): PropertyValueRecord {
  const effective = computeEffectiveProperties(pending.objectId, objectTable, propertyDefinitionsByObject);
  const property = effective[pending.propertyIndex];
  const name = property?.name ?? null;
  const redacted = options.redactPasswordProperties && name === "password";
  return {
    kind: "property_value",
    objectId: pending.objectId,
    object: `#${pending.objectId}`,
    propertyIndex: pending.propertyIndex,
    name,
    nameConfidence: property?.confidence ?? "unknown",
    ...(pending.owner ? { owner: pending.owner } : {}),
    ...(pending.permissionsRaw !== undefined ? { permissionsRaw: pending.permissionsRaw, permissions: decodePermissions(pending.permissionsRaw) } : {}),
    value: redacted
      ? { type: "redacted", reason: "password-property", truncated: false, redacted: true }
      : pending.value
  };
}

async function materializeNativePropertyValuesToOutput(
  tempValuesPath: string,
  options: NormalizedExtractOptions,
  objects: ObjectRecord[],
  properties: PropertyDefinitionRecord[]
): Promise<{ coreCandidates: number; passwordPropertiesRedacted: number }> {
  const objectTable = new Map(objects.map((object) => [object.objectId, object]));
  const propertyDefinitionsByObject = new Map<number, PropertyDefinitionRecord[]>();
  for (const property of properties) {
    const list = propertyDefinitionsByObject.get(property.objectId) ?? [];
    list.push(property);
    propertyDefinitionsByObject.set(property.objectId, list);
  }

  const effectivePropertyCache = new Map<number, ReturnType<typeof computeEffectiveProperties>>();
  const propertyValueWriter = new JsonlWriter<PropertyValueRecord>(join(options.outputDir, "property_values.jsonl"), options.pretty);
  const coreCandidateWriter = new JsonlWriter<CoreCandidateRecord>(join(options.outputDir, "core_candidates.jsonl"), options.pretty);
  const coreCandidateKeys = new Set<string>();
  let coreCandidates = 0;
  let passwordPropertiesRedacted = 0;

  const reader = new LineReader(tempValuesPath);
  try {
    for await (const line of reader) {
      if (!line) continue;
      const pending = JSON.parse(line) as NativeRawPropertyValueRecord;
      let effective = effectivePropertyCache.get(pending.objectId);
      if (!effective) {
        effective = computeEffectiveProperties(pending.objectId, objectTable, propertyDefinitionsByObject);
        effectivePropertyCache.set(pending.objectId, effective);
      }
      const property = effective[pending.propertyIndex];
      const record = materializeNativePropertyValueFromEffective(pending, property, options);
      if (record.value.redacted) passwordPropertiesRedacted += 1;
      await propertyValueWriter.write(record);

      for (const candidate of coreCandidatesFromPropertyValue(record)) {
        const key = JSON.stringify(candidate);
        if (coreCandidateKeys.has(key)) continue;
        coreCandidateKeys.add(key);
        await coreCandidateWriter.write(candidate);
        coreCandidates += 1;
      }
    }
  } finally {
    reader.close();
    await propertyValueWriter.close();
    await coreCandidateWriter.close();
  }

  return { coreCandidates, passwordPropertiesRedacted };
}

function materializeNativePropertyValueFromEffective(
  pending: NativeRawPropertyValueRecord,
  property: ReturnType<typeof computeEffectiveProperties>[number] | undefined,
  options: NormalizedExtractOptions
): PropertyValueRecord {
  const name = property?.name ?? null;
  const redacted = options.redactPasswordProperties && name === "password";
  return {
    kind: "property_value",
    objectId: pending.objectId,
    object: `#${pending.objectId}`,
    propertyIndex: pending.propertyIndex,
    name,
    nameConfidence: property?.confidence ?? "unknown",
    ...(pending.owner ? { owner: pending.owner } : {}),
    ...(pending.permissionsRaw !== undefined ? { permissionsRaw: pending.permissionsRaw, permissions: decodePermissions(pending.permissionsRaw) } : {}),
    value: redacted
      ? { type: "redacted", reason: "password-property", truncated: false, redacted: true }
      : pending.value
  };
}

function coreCandidatesFromPropertyValue(record: PropertyValueRecord): CoreCandidateRecord[] {
  if (record.object !== "#0" || !record.name) return [];
  if (record.value.type === "object" && record.value.object) {
    return [{
      kind: "core_candidate",
      symbol: `$${record.name}`,
      property: record.name,
      sourceObject: "#0",
      target: record.value.object,
      confidence: "object-property-on-root"
    }];
  }
  const refs = record.value.objectRefs ?? [];
  if (refs.length === 0) return [];
  return [{
    kind: "core_collection_candidate",
    symbol: `$${record.name}`,
    property: record.name,
    sourceObject: "#0",
    objectRefs: refs,
    confidence: "collection-property-on-root"
  }];
}

async function writeFinalArtifacts(
  options: NormalizedExtractOptions,
  startedAt: string,
  header: { dbVersion: string; rawHeaderLines: string[] },
  stats: ReturnType<typeof createEmptyStats>,
  errors: ExtractErrorSummary[]
): Promise<void> {
  syncStatsCounters(stats);
  await writeJsonlFile(join(options.outputDir, "errors.jsonl"), errors, options.pretty);
  await writeFile(join(options.outputDir, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  await writeManifest({
    snapshotId: options.snapshotId,
    sourcePath: options.inputPath,
    outputDir: options.outputDir,
    extractorVersion: "0.1.0",
    startedAt,
    completedAt: new Date().toISOString(),
    header
  });
}

async function writeJsonlFile<T>(path: string, records: T[], pretty: boolean): Promise<void> {
  const writer = new JsonlWriter<T>(path, pretty);
  for (const record of records) await writer.write(record);
  await writer.close();
}

async function ensureEmptyOutputFiles(options: NormalizedExtractOptions): Promise<void> {
  for (const file of [
    "objects.jsonl",
    "verbs.jsonl",
    "properties.jsonl",
    "property_values.jsonl",
    "core_candidates.jsonl"
  ]) {
    const writer = new JsonlWriter<unknown>(join(options.outputDir, file), options.pretty);
    await writer.close();
  }
}

async function closeQuietly(writer: JsonlWriter<unknown>): Promise<void> {
  try {
    await writer.close();
  } catch {
    // Best effort during fatal error cleanup.
  }
}

function objectRefsFromSummary(summary: import("../model/types.js").ToastValueSummary): ObjectId[] {
  if (summary.type === "object" && summary.object) return [summary.object];
  return summary.objectRefs ?? [];
}

function firstObjectRef(summary: import("../model/types.js").ToastValueSummary): ObjectId | undefined {
  return objectRefsFromSummary(summary)[0];
}

function toObjectId(id: number): ObjectId {
  return `#${id}` as ObjectId;
}

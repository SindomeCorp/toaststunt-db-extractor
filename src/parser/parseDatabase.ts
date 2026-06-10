import type { CoreCandidateRecord, ExtractErrorSummary, NormalizedExtractOptions, ParsedDatabase, VerbRecord } from "../model/types.js";
import { DbCursor } from "../reader/DbCursor.js";
import { LineReader } from "../reader/LineReader.js";
import { createEmptyStats } from "../emit/StatsCollector.js";
import { parseHeader } from "./parseHeader.js";
import { parseNativeDatabase } from "./parseNativeDatabase.js";
import { parseObjects, materializePropertyValues } from "./parseObjects.js";
import { parseProgrammedVerbs } from "./parseProgrammedVerbs.js";

export async function parseDatabase(options: NormalizedExtractOptions): Promise<ParsedDatabase> {
  if (await looksLikeNativeToastStuntDatabase(options.inputPath)) {
    return parseNativeDatabase(options);
  }

  const reader = new LineReader(options.inputPath);
  const cursor = new DbCursor(reader);
  const errors: ExtractErrorSummary[] = [];
  try {
    const header = await parseHeader(cursor);
    await cursor.expectLine("objects", "objects");
    const objectCount = await cursor.readInt("objects");
    const objectsSection = await parseObjects(cursor, objectCount);

    const objectTable = new Map(objectsSection.objects.map((object) => [object.objectId, object]));
    const propertyDefinitionsByObject = new Map<number, typeof objectsSection.properties>();
    for (const property of objectsSection.properties) {
      const existing = propertyDefinitionsByObject.get(property.objectId) ?? [];
      existing.push(property);
      propertyDefinitionsByObject.set(property.objectId, existing);
    }

    const propertyValues = options.includePropertyValues
      ? materializePropertyValues(
          objectsSection.pendingPropertyValues,
          objectTable,
          propertyDefinitionsByObject,
          options,
          options.redactPasswordProperties
        )
      : [];

    await cursor.expectLine("programmed_verbs", "programmed_verbs");
    const programmedVerbCount = await cursor.readInt("programmed_verbs");
    const programs = await parseProgrammedVerbs(cursor, programmedVerbCount);

    const verbById = new Map<string, VerbRecord>();
    for (const verb of objectsSection.verbs) verbById.set(verb.id, verb);
    for (const program of programs) {
      const key = `#${program.objectId}:${program.verbIndex}`;
      const verb = verbById.get(key);
      if (verb) {
        verb.hasProgram = true;
      } else {
        errors.push({
          fatal: false,
          section: "programmed_verbs",
          line: program.line,
          message: `Programmed verb ${key} had no matching verb metadata`,
          object: `#${program.objectId}` as `#${number}`,
          verbIndex: program.verbIndex
        });
      }
    }

    const coreCandidates: CoreCandidateRecord[] = propertyValues
      .filter((value) => value.object === "#0" && value.name)
      .flatMap<CoreCandidateRecord>((value) => {
        const name = value.name!;
        if (value.value.type === "object" && value.value.object) {
          return [
            {
              kind: "core_candidate" as const,
              symbol: `$${name}`,
              property: name,
              sourceObject: "#0" as const,
              target: value.value.object,
              confidence: "object-property-on-root" as const
            }
          ];
        }
        const refs = value.value.objectRefs ?? [];
        if (refs.length > 0) {
          return [
            {
              kind: "core_collection_candidate" as const,
              symbol: `$${name}`,
              property: name,
              sourceObject: "#0" as const,
              objectRefs: refs,
              confidence: "collection-property-on-root" as const
            }
          ];
        }
        return [];
      });

    const stats = createEmptyStats();
    stats.objects = objectsSection.objects.length;
    stats.verbs = objectsSection.verbs.length;
    stats.programmedVerbs = programs.length;
    stats.properties = objectsSection.properties.length;
    stats.propertyValues = propertyValues.length;
    stats.coreCandidates = coreCandidates.length;
    stats.passwordPropertiesRedacted = propertyValues.filter((value) => value.value.redacted).length;
    stats.warnings = errors.filter((error) => !error.fatal).length;
    stats.errors = errors.filter((error) => error.fatal).length;

    return {
      header,
      objects: objectsSection.objects,
      verbs: objectsSection.verbs,
      properties: objectsSection.properties,
      propertyValues,
      coreCandidates,
      programs,
      errors,
      stats
    };
  } catch (error) {
    const summary = {
      fatal: true,
      section: typeof error === "object" && error !== null && "section" in error ? String(error.section) : "database",
      line: typeof error === "object" && error !== null && "line" in error ? Number(error.line) : cursor.lineNumber,
      message: error instanceof Error ? error.message : String(error)
    };
    return {
      header: { dbVersion: "unknown", rawHeaderLines: [] },
      objects: [],
      verbs: [],
      properties: [],
      propertyValues: [],
      coreCandidates: [],
      programs: [],
      errors: [summary],
      stats: { ...createEmptyStats(), errors: 1 }
    };
  } finally {
    reader.close();
  }
}

export async function looksLikeNativeToastStuntDatabase(inputPath: string): Promise<boolean> {
  const reader = new LineReader(inputPath);
  try {
    const iterator = reader[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();
    return !first.done && !second.done && first.value.startsWith("** LambdaMOO Database") && /^\d+$/.test(second.value);
  } finally {
    reader.close();
  }
}

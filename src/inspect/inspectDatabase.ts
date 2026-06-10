import { stat } from "node:fs/promises";
import type { InspectResult } from "../model/types.js";
import { DbCursor } from "../reader/DbCursor.js";
import { LineReader } from "../reader/LineReader.js";
import { skipNativeValue } from "../parser/parseNativeValue.js";

export async function inspectDatabase(inputPath: string): Promise<InspectResult> {
  const sourceStat = await stat(inputPath);
  const nativeResult = await inspectNativeDatabase(inputPath, sourceStat.size, sourceStat.mtime.toISOString());
  if (nativeResult) return nativeResult;

  const warnings: string[] = [];
  let dbVersion = "unknown";
  let objectCount: number | undefined;
  let programmedVerbCount: number | undefined;
  let objectSectionDetected = false;
  let programmedVerbSectionDetected = false;

  const reader = new LineReader(inputPath);
  let previousLine = "";
  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (lineNumber === 1) {
        if (line.startsWith("TOASTSTUNT-DB-EXTRACTOR-FIXTURE")) dbVersion = line.split(/\s+/).at(1) ?? "fixture";
        else if (line.startsWith("** LambdaMOO Database")) dbVersion = line;
      }
      if (line === "objects") {
        objectSectionDetected = true;
        previousLine = line;
        continue;
      }
      if (previousLine === "objects" && objectCount === undefined && /^-?\d+$/.test(line)) {
        objectCount = Number.parseInt(line, 10);
      }
      if (line === "programmed_verbs") {
        programmedVerbSectionDetected = true;
        previousLine = line;
        continue;
      }
      if (previousLine === "programmed_verbs" && programmedVerbCount === undefined && /^-?\d+$/.test(line)) {
        programmedVerbCount = Number.parseInt(line, 10);
        break;
      }
      previousLine = line;
      if (lineNumber > 200000 && objectCount !== undefined) {
        warnings.push("Stopped inspection after 200000 lines before programmed verb section was found.");
        break;
      }
    }
  } finally {
    reader.close();
  }

  return {
    sourcePath: inputPath,
    sourceSizeBytes: sourceStat.size,
    sourceMtime: sourceStat.mtime.toISOString(),
    format: { server: "toaststunt", dbVersion },
    ...(objectCount !== undefined ? { objectCount } : {}),
    ...(programmedVerbCount !== undefined ? { programmedVerbCount } : {}),
    objectSectionDetected,
    programmedVerbSectionDetected,
    warnings
  };
}

async function inspectNativeDatabase(
  inputPath: string,
  sourceSizeBytes: number,
  sourceMtime: string
): Promise<InspectResult | null> {
  const reader = new LineReader(inputPath);
  const cursor = new DbCursor(reader);
  try {
    const first = await cursor.nextLine("header");
    if (!first.startsWith("** LambdaMOO Database")) return null;
    const playerCount = await cursor.readInt("header");
    for (let i = 0; i < playerCount; i += 1) await cursor.nextLine("header");
    const objectCount = await findNativeObjectCount(cursor);
    await skipNativeObjects(cursor, objectCount);
    await cursor.expectLine("0", "objects");
    const programmedVerbCount = await cursor.readInt("programmed_verbs");
    return {
      sourcePath: inputPath,
      sourceSizeBytes,
      sourceMtime,
      format: { server: "toaststunt", dbVersion: first },
      objectCount,
      programmedVerbCount,
      objectSectionDetected: true,
      programmedVerbSectionDetected: true,
      warnings: []
    };
  } catch (error) {
    return {
      sourcePath: inputPath,
      sourceSizeBytes,
      sourceMtime,
      format: { server: "toaststunt", dbVersion: "unknown" },
      objectSectionDetected: false,
      programmedVerbSectionDetected: false,
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  } finally {
    reader.close();
  }
}

async function findNativeObjectCount(cursor: DbCursor): Promise<number> {
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

async function skipNativeObjects(cursor: DbCursor, objectCount: number): Promise<void> {
  for (let i = 0; i < objectCount; i += 1) {
    await skipNativeObject(cursor);
  }
}

async function skipNativeObject(cursor: DbCursor): Promise<void> {
  const idLine = await cursor.nextLine("objects");
  if (/^#-?\d+ recycled$/.test(idLine)) return;
  if (!/^#-?\d+$/.test(idLine)) {
    throw new Error(`Expected object id at line ${cursor.lineNumber}, got ${idLine}`);
  }

  await cursor.nextLine("objects");
  await cursor.readInt("objects");
  await cursor.readInt("objects");
  await skipNativeValue(cursor);
  await skipNativeValue(cursor);
  await skipNativeValue(cursor);
  await skipNativeValue(cursor);
  await skipNativeValue(cursor);

  const verbCount = await cursor.readInt("objects");
  for (let i = 0; i < verbCount; i += 1) {
    await cursor.nextLine("objects");
    await cursor.readInt("objects");
    await cursor.readInt("objects");
    await cursor.readInt("objects");
  }

  const propertyDefinitionCount = await cursor.readInt("objects");
  for (let i = 0; i < propertyDefinitionCount; i += 1) {
    await cursor.nextLine("objects");
  }

  const propertyValueCount = await cursor.readInt("objects");
  for (let i = 0; i < propertyValueCount; i += 1) {
    await skipNativeValue(cursor);
    await cursor.nextLine("objects");
    await cursor.nextLine("objects");
  }
}

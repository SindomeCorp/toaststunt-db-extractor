import { decodeObjectFlags, isRecycled } from "../model/flags.js";
import type { ObjectId, ObjectRecord } from "../model/types.js";
import type { DbCursor } from "../reader/DbCursor.js";
import { createPropertyDefinition } from "./parsePropertyDefinitions.js";
import { createPropertyValue } from "./parsePropertyValues.js";
import { parseVerbMetadataLine } from "./parseVerbMetadata.js";
import type { ValueParseOptions } from "./parseValue.js";

export interface RawObjectRecord {
  object: ObjectRecord;
  verbs: ReturnType<typeof parseVerbMetadataLine>[];
  properties: ReturnType<typeof createPropertyDefinition>[];
  pendingPropertyValues: PendingPropertyValue[];
}

export interface PendingPropertyValue {
  objectId: number;
  propertyIndex: number;
  rawValue: string;
  owner?: ObjectId;
  permissionsRaw?: number;
}

export async function parseObjectRecord(cursor: DbCursor): Promise<RawObjectRecord> {
  const objectId = await cursor.readInt("objects");
  const name = await cursor.readString("objects");
  const flagsRaw = await cursor.readInt("objects");
  const owner = (await cursor.readString("objects")) as ObjectId;
  const location = (await cursor.readString("objects")) as ObjectId;
  const lastMove = await cursor.readInt("objects");
  const parents = parseObjectIdList(await cursor.readString("objects"));
  const children = parseObjectIdList(await cursor.readString("objects"));
  const contents = parseObjectIdList(await cursor.readString("objects"));

  const verbCount = await cursor.readInt("objects");
  const verbs = [];
  for (let i = 0; i < verbCount; i += 1) {
    verbs.push(parseVerbMetadataLine(objectId, i, await cursor.readString("objects")));
  }

  const propertyDefinitionCount = await cursor.readInt("objects");
  const properties = [];
  for (let i = 0; i < propertyDefinitionCount; i += 1) {
    properties.push(createPropertyDefinition(objectId, await cursor.readString("objects"), i));
  }

  const propertyValueCount = await cursor.readInt("objects");
  const pendingPropertyValues: PendingPropertyValue[] = [];
  for (let i = 0; i < propertyValueCount; i += 1) {
    const propertyIndex = await cursor.readInt("objects");
    const rawValue = await cursor.readString("objects");
    if (rawValue.trim() === "clear") {
      pendingPropertyValues.push({ objectId, propertyIndex, rawValue });
    } else {
      const valueOwner = (await cursor.readString("objects")) as ObjectId;
      const permissionsRaw = await cursor.readInt("objects");
      pendingPropertyValues.push({ objectId, propertyIndex, rawValue, owner: valueOwner, permissionsRaw });
    }
  }

  const object = {
    kind: "object" as const,
    objectId,
    id: `#${objectId}` as ObjectId,
    name,
    owner,
    location,
    lastMove,
    parents,
    children,
    contents,
    flagsRaw,
    flags: decodeObjectFlags(flagsRaw),
    verbCount,
    propertyDefinitionCount,
    propertyValueCount,
    recycled: isRecycled(flagsRaw)
  };

  return { object, verbs, properties, pendingPropertyValues };
}

export function parseObjectIdList(line: string): ObjectId[] {
  if (line.trim() === "" || line.trim() === "-") return [];
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.startsWith("#") ? part : `#${part}`) as ObjectId);
}

export function materializePropertyValue(
  pending: PendingPropertyValue,
  name: string | null,
  confidence: "direct" | "computed" | "computed-multiple-inheritance" | "unknown",
  options: ValueParseOptions,
  redactPasswordProperties: boolean
) {
  return createPropertyValue(
    pending.objectId,
    pending.propertyIndex,
    name,
    confidence,
    pending.rawValue,
    pending.owner,
    pending.permissionsRaw,
    options,
    redactPasswordProperties
  );
}

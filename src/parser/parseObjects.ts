import type { EffectiveProperty, ObjectId, ObjectRecord, PropertyDefinitionRecord } from "../model/types.js";
import type { DbCursor } from "../reader/DbCursor.js";
import { materializePropertyValue, parseObjectRecord, type PendingPropertyValue } from "./parseObjectRecord.js";
import type { ValueParseOptions } from "./parseValue.js";

export interface ParsedObjectsSection {
  objects: ObjectRecord[];
  verbs: import("../model/types.js").VerbRecord[];
  properties: PropertyDefinitionRecord[];
  pendingPropertyValues: PendingPropertyValue[];
}

export async function parseObjects(cursor: DbCursor, count: number): Promise<ParsedObjectsSection> {
  const objects: ObjectRecord[] = [];
  const verbs: import("../model/types.js").VerbRecord[] = [];
  const properties: PropertyDefinitionRecord[] = [];
  const pendingPropertyValues: PendingPropertyValue[] = [];

  for (let i = 0; i < count; i += 1) {
    const parsed = await parseObjectRecord(cursor);
    objects.push(parsed.object);
    verbs.push(...parsed.verbs);
    properties.push(...parsed.properties);
    pendingPropertyValues.push(...parsed.pendingPropertyValues);
  }

  return { objects, verbs, properties, pendingPropertyValues };
}

export function computeEffectiveProperties(
  objectId: number,
  objectTable: Map<number, ObjectRecord>,
  propertyDefinitionsByObject: Map<number, PropertyDefinitionRecord[]>
): EffectiveProperty[] {
  const visited = new Set<number>();
  const result: EffectiveProperty[] = [];

  const visit = (currentId: number, inheritedConfidence: EffectiveProperty["confidence"]): void => {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const object = objectTable.get(currentId);
    if (!object) return;
    const parentIds = object.parents.map((parent) => Number.parseInt(parent.slice(1), 10)).filter((id) => id >= 0);
    const nextConfidence = parentIds.length > 1 ? "computed-multiple-inheritance" : inheritedConfidence;
    for (const definition of propertyDefinitionsByObject.get(currentId) ?? []) {
      result.push({
        name: definition.name,
        definedOn: `#${currentId}` as ObjectId,
        confidence: currentId === objectId ? "direct" : nextConfidence
      });
    }
    for (const parentId of parentIds) visit(parentId, nextConfidence);
  };

  visit(objectId, "computed");
  return result;
}

export function materializePropertyValues(
  pendingValues: PendingPropertyValue[],
  objectTable: Map<number, ObjectRecord>,
  propertyDefinitionsByObject: Map<number, PropertyDefinitionRecord[]>,
  options: ValueParseOptions,
  redactPasswordProperties: boolean
) {
  return pendingValues.map((pending) => {
    const effective = computeEffectiveProperties(pending.objectId, objectTable, propertyDefinitionsByObject);
    const property = effective[pending.propertyIndex];
    return materializePropertyValue(
      pending,
      property?.name ?? null,
      property?.confidence ?? "unknown",
      options,
      redactPasswordProperties
    );
  });
}

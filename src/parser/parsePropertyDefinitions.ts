import type { ObjectId, PropertyDefinitionRecord } from "../model/types.js";

export function createPropertyDefinition(objectId: number, name: string, definitionIndex: number): PropertyDefinitionRecord {
  const object = `#${objectId}` as ObjectId;
  return {
    kind: "property_definition",
    id: `${object}.${name}`,
    objectId,
    object,
    name,
    definitionIndex
  };
}

import { decodePermissions } from "../model/permissions.js";
import type { NameConfidence, ObjectId, PropertyValueRecord, ToastValueSummary } from "../model/types.js";
import { parseValue, type ValueParseOptions } from "./parseValue.js";

export function createPropertyValue(
  objectId: number,
  propertyIndex: number,
  name: string | null,
  nameConfidence: NameConfidence,
  rawValue: string,
  ownerRaw: string | undefined,
  permissionsRawValue: number | undefined,
  options: ValueParseOptions,
  redactPasswordProperties: boolean
): PropertyValueRecord {
  const object = `#${objectId}` as ObjectId;

  let value: ToastValueSummary;
  if (redactPasswordProperties && name === "password") {
    value = {
      type: "redacted",
      reason: "password-property",
      truncated: false,
      redacted: true
    };
  } else {
    value = parseValue(rawValue, options).summary;
  }

  return {
    kind: "property_value",
    objectId,
    object,
    propertyIndex,
    name,
    nameConfidence,
    ...(ownerRaw ? { owner: ownerRaw as ObjectId } : {}),
    ...(permissionsRawValue !== undefined
      ? { permissionsRaw: permissionsRawValue, permissions: decodePermissions(permissionsRawValue) }
      : {}),
    value
  };
}

import { decodePermissions } from "../model/permissions.js";
import { decodePrepositions } from "../model/prepositions.js";
import type { ObjectId, VerbRecord } from "../model/types.js";

export function parseVerbMetadataLine(objectId: number, verbIndex: number, line: string): VerbRecord {
  const parts = line.split("|");
  const namesRaw = parts[0] ?? "";
  const owner = (parts[1] ?? "#-1") as ObjectId;
  const permissionsRaw = Number.parseInt(parts[2] ?? "0", 10);
  const prepositionsRaw = Number.parseInt(parts[3] ?? "0", 10);
  const names = namesRaw.split(/\s+/).filter(Boolean);
  const primaryName = names[0] ?? `verb_${verbIndex}`;
  const object = `#${objectId}` as ObjectId;

  return {
    kind: "verb",
    id: `${object}:${verbIndex}`,
    objectId,
    object,
    verbIndex,
    namesRaw,
    names,
    primaryName,
    owner,
    permissionsRaw,
    permissions: decodePermissions(permissionsRaw),
    prepositionsRaw,
    prepositions: decodePrepositions(prepositionsRaw),
    hasProgram: false
  };
}

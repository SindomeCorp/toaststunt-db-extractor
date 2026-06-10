import type { DbHeader } from "../model/types.js";
import type { DbCursor } from "../reader/DbCursor.js";

export async function parseHeader(cursor: DbCursor): Promise<DbHeader> {
  const first = await cursor.nextLine("header");
  const rawHeaderLines = [first];
  let dbVersion = "unknown";

  if (first.startsWith("TOASTSTUNT-DB-EXTRACTOR-FIXTURE")) {
    dbVersion = first.split(/\s+/).at(1) ?? "fixture";
    return { dbVersion, rawHeaderLines };
  }

  if (first.startsWith("** LambdaMOO Database")) {
    dbVersion = first;
  }

  return { dbVersion, rawHeaderLines };
}

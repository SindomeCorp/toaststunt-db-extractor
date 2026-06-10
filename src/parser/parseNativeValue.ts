import type { ObjectId, ToastMapEntry, ToastValue, ToastValueSummary } from "../model/types.js";
import type { DbCursor } from "../reader/DbCursor.js";
import { collectObjectRefs, summarizeValue, type ValueParseOptions } from "./parseValue.js";

export async function parseNativeValue(cursor: DbCursor, options: ValueParseOptions, depth = 0): Promise<{ value: ToastValue; summary: ToastValueSummary }> {
  if (depth > options.maxValueDepth) {
    await skipNativeValue(cursor);
    const value: ToastValue = { type: "unknown", rawType: "max-depth" };
    return { value, summary: { type: "unknown", value: "max-depth", objectRefs: [], truncated: true, redacted: false } };
  }

  const typeLine = await cursor.nextLine("values");
  const type = Number.parseInt(typeLine, 10);
  let value: ToastValue;

  switch (type) {
    case 0: {
      const raw = await cursor.nextLine("values");
      const parsed = Number(raw);
      value = { type: "int", value: Number.isSafeInteger(parsed) ? parsed : raw };
      break;
    }
    case 1: {
      const id = await cursor.readInt("values");
      value = { type: "object", object: `#${id}` as ObjectId };
      break;
    }
    case 2: {
      let stringValue = await cursor.nextLine("values");
      let truncated = false;
      if (Buffer.byteLength(stringValue, "utf8") > options.maxStringBytes) {
        stringValue = Buffer.from(stringValue, "utf8").subarray(0, options.maxStringBytes).toString("utf8");
        truncated = true;
      }
      value = { type: "string", value: stringValue, ...(truncated ? { truncated } : {}) };
      break;
    }
    case 3: {
      const raw = await cursor.nextLine("values");
      const code = Number(raw);
      value = Number.isSafeInteger(code)
        ? { type: "error", code, name: errorName(code) }
        : { type: "unknown", rawType: 3, raw };
      break;
    }
    case 7:
    case 8: {
      const raw = await cursor.nextLine("values");
      const parsed = Number(raw);
      value = { type: "int", value: Number.isSafeInteger(parsed) ? parsed : raw };
      break;
    }
    case 4: {
      const count = await cursor.readInt("values");
      const items: ToastValue[] = [];
      let truncated = false;
      for (let i = 0; i < count; i += 1) {
        if (items.length < options.maxCollectionItems) {
          items.push((await parseNativeValue(cursor, options, depth + 1)).value);
        } else {
          truncated = true;
          await skipNativeValue(cursor);
        }
      }
      value = { type: "list", items, ...(truncated ? { truncated } : {}) };
      break;
    }
    case 5:
      value = { type: "clear" };
      break;
    case 6:
      value = { type: "none" };
      break;
    case 9: {
      const raw = await cursor.nextLine("values");
      const parsed = Number(raw);
      value = { type: "float", value: Number.isFinite(parsed) ? parsed : raw };
      break;
    }
    case 10: {
      const count = await cursor.readInt("values");
      const entries: ToastMapEntry[] = [];
      let truncated = false;
      for (let i = 0; i < count; i += 1) {
        const key = (await parseNativeValue(cursor, options, depth + 1)).value;
        const entryValue = (await parseNativeValue(cursor, options, depth + 1)).value;
        if (entries.length < options.maxCollectionItems) {
          entries.push({ key, value: entryValue });
        } else {
          truncated = true;
        }
      }
      value = { type: "map", entries, ...(truncated ? { truncated } : {}) };
      break;
    }
    case 12: {
      const id = await cursor.readInt("values");
      value = { type: "object", object: `#${id}` as ObjectId };
      break;
    }
    case 13:
      value = await parseNativeWaif(cursor, options, depth);
      break;
    case 14: {
      const boolValue = Number.parseInt(await cursor.nextLine("values"), 10);
      value = { type: "int", value: boolValue === 0 ? 0 : 1 };
      break;
    }
    default: {
      const raw = await cursor.nextLine("values");
      value = { type: "unknown", rawType: typeLine, raw };
    }
  }

  const summary = summarizeValue(value);
  if (value.type === "waif") {
    summary.objectRefs = collectObjectRefs(value);
  }
  return { value, summary };
}

export async function skipNativeValue(cursor: DbCursor): Promise<void> {
  const type = Number.parseInt(await cursor.nextLine("values"), 10);
  switch (type) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 9:
    case 12:
    case 14:
      await cursor.nextLine("values");
      return;
    case 4: {
      const count = await cursor.readInt("values");
      for (let i = 0; i < count; i += 1) await skipNativeValue(cursor);
      return;
    }
    case 5:
    case 6:
      return;
    case 10: {
      const count = await cursor.readInt("values");
      for (let i = 0; i < count; i += 1) {
        await skipNativeValue(cursor);
        await skipNativeValue(cursor);
      }
      return;
    }
    case 13:
      await skipNativeWaif(cursor);
      return;
    default:
      await cursor.nextLine("values");
  }
}

async function parseNativeWaif(cursor: DbCursor, options: ValueParseOptions, depth: number): Promise<ToastValue> {
  const marker = await cursor.nextLine("values");
  if (marker.startsWith("r")) {
    await cursor.expectLine(".", "values");
    return { type: "waif", summary: { ref: marker } };
  }
  const klass = await cursor.readInt("values");
  const owner = await cursor.readInt("values");
  const propertyCapacity = await cursor.readInt("values");
  const values: Array<{ index: number; value: ToastValue }> = [];
  while (true) {
    const index = await cursor.readInt("values");
    if (index === -1) break;
    const value = (await parseNativeValue(cursor, options, depth + 1)).value;
    if (values.length < options.maxCollectionItems) values.push({ index, value });
  }
  await cursor.expectLine(".", "values");
  return { type: "waif", summary: { marker, class: `#${klass}`, owner: `#${owner}`, propertyCapacity, values } };
}

async function skipNativeWaif(cursor: DbCursor): Promise<void> {
  const marker = await cursor.nextLine("values");
  if (marker.startsWith("r")) {
    await cursor.expectLine(".", "values");
    return;
  }
  await cursor.nextLine("values");
  await cursor.nextLine("values");
  await cursor.nextLine("values");
  while (true) {
    const index = await cursor.readInt("values");
    if (index === -1) break;
    await skipNativeValue(cursor);
  }
  await cursor.expectLine(".", "values");
}

function errorName(code: number): string {
  return [
    "E_NONE",
    "E_TYPE",
    "E_DIV",
    "E_PERM",
    "E_PROPNF",
    "E_VERBNF",
    "E_VARNF",
    "E_INVIND",
    "E_RECMOVE",
    "E_MAXREC",
    "E_RANGE",
    "E_ARGS",
    "E_NACC",
    "E_INVARG",
    "E_QUOTA",
    "E_FLOAT",
    "E_FILE",
    "E_EXEC",
    "E_INTRPT"
  ][code] ?? `E_${code}`;
}

import type { ObjectId, ToastMapEntry, ToastValue, ToastValueSummary } from "../model/types.js";

export interface ValueParseOptions {
  maxValueDepth: number;
  maxStringBytes: number;
  maxCollectionItems: number;
}

class ValueStringParser {
  private index = 0;
  private truncated = false;

  constructor(
    private readonly raw: string,
    private readonly options: ValueParseOptions
  ) {}

  parse(): { value: ToastValue; truncated: boolean } {
    const value = this.parseValue(0);
    this.skipWs();
    if (this.index < this.raw.length) {
      return {
        value: { type: "unknown", rawType: "trailing-data", raw: this.raw.slice(this.index) },
        truncated: this.truncated
      };
    }
    return { value, truncated: this.truncated };
  }

  private parseValue(depth: number): ToastValue {
    if (depth > this.options.maxValueDepth) {
      this.truncated = true;
      return { type: "unknown", rawType: "max-depth" };
    }

    this.skipWs();
    if (this.match("clear")) return { type: "clear" };
    if (this.match("none")) return { type: "none" };
    if (this.match("ERR")) return this.parseError();
    if (this.match("waif")) return this.parseWaif();

    const char = this.raw[this.index];
    if (char === "\"") return this.parseString();
    if (char === "#") return this.parseObject();
    if (char === "[") return this.parseList(depth);
    if (this.raw.startsWith("map{", this.index) || char === "{") return this.parseMap(depth);
    return this.parseNumberOrUnknown();
  }

  private parseString(): ToastValue {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.raw.length) {
      const char = this.raw[this.index];
      this.index += 1;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        break;
      }
    }
    const literal = this.raw.slice(start, this.index);
    let value: string;
    try {
      value = JSON.parse(literal) as string;
    } catch {
      value = literal.slice(1, -1);
    }
    if (Buffer.byteLength(value, "utf8") > this.options.maxStringBytes) {
      this.truncated = true;
      value = Buffer.from(value, "utf8").subarray(0, this.options.maxStringBytes).toString("utf8");
      return { type: "string", value, truncated: true };
    }
    return { type: "string", value };
  }

  private parseObject(): ToastValue {
    this.index += 1;
    const value = this.readSignedInteger();
    return { type: "object", object: `#${value}` as ObjectId };
  }

  private parseError(): ToastValue {
    this.skipWs();
    const code = this.readSignedInteger();
    this.skipWs();
    const name = this.readBareToken();
    return { type: "error", code, ...(name ? { name } : {}) };
  }

  private parseWaif(): ToastValue {
    const summary = this.raw.slice(this.index).trim();
    this.index = this.raw.length;
    return { type: "waif", summary };
  }

  private parseList(depth: number): ToastValue {
    this.index += 1;
    const items: ToastValue[] = [];
    while (this.index < this.raw.length) {
      this.skipWs();
      if (this.raw[this.index] === "]") {
        this.index += 1;
        return { type: "list", items, ...(this.truncated ? { truncated: true } : {}) };
      }
      if (items.length < this.options.maxCollectionItems) {
        items.push(this.parseValue(depth + 1));
      } else {
        this.truncated = true;
        this.skipCollectionValue();
      }
      this.skipWs();
      if (this.raw[this.index] === ",") this.index += 1;
    }
    return { type: "list", items, truncated: true };
  }

  private parseMap(depth: number): ToastValue {
    if (this.raw.startsWith("map", this.index)) this.index += 3;
    if (this.raw[this.index] === "{") this.index += 1;
    const entries: ToastMapEntry[] = [];
    while (this.index < this.raw.length) {
      this.skipWs();
      if (this.raw[this.index] === "}") {
        this.index += 1;
        return { type: "map", entries, ...(this.truncated ? { truncated: true } : {}) };
      }
      const key = this.parseValue(depth + 1);
      this.skipWs();
      if (this.raw[this.index] === ":" || this.raw[this.index] === "=") this.index += 1;
      this.skipWs();
      const value = this.parseValue(depth + 1);
      if (entries.length < this.options.maxCollectionItems) {
        entries.push({ key, value });
      } else {
        this.truncated = true;
      }
      this.skipWs();
      if (this.raw[this.index] === ",") this.index += 1;
    }
    return { type: "map", entries, truncated: true };
  }

  private parseNumberOrUnknown(): ToastValue {
    const token = this.readBareToken();
    if (/^-?\d+$/.test(token)) {
      const value = Number(token);
      return { type: "int", value: Number.isSafeInteger(value) ? value : token };
    }
    if (/^-?\d+\.\d+(e[+-]?\d+)?$/i.test(token)) {
      const value = Number(token);
      return { type: "float", value: Number.isFinite(value) ? value : token };
    }
    return { type: "unknown", rawType: token || "empty", raw: this.raw };
  }

  private skipCollectionValue(): void {
    this.parseValue(this.options.maxValueDepth + 1);
  }

  private skipWs(): void {
    while (/\s/.test(this.raw[this.index] ?? "")) this.index += 1;
  }

  private match(token: string): boolean {
    if (!this.raw.startsWith(token, this.index)) return false;
    const next = this.raw[this.index + token.length];
    if (next && /[A-Za-z0-9_]/.test(next)) return false;
    this.index += token.length;
    return true;
  }

  private readSignedInteger(): number {
    const match = /^-?\d+/.exec(this.raw.slice(this.index));
    if (!match) return 0;
    this.index += match[0].length;
    return Number.parseInt(match[0], 10);
  }

  private readBareToken(): string {
    this.skipWs();
    const match = /^[^\s,\]}:=]+/.exec(this.raw.slice(this.index));
    if (!match) return "";
    this.index += match[0].length;
    return match[0];
  }
}

export function parseValue(raw: string, options: ValueParseOptions): { value: ToastValue; summary: ToastValueSummary } {
  const parser = new ValueStringParser(raw.trim(), options);
  const parsed = parser.parse();
  return {
    value: parsed.value,
    summary: summarizeValue(parsed.value, parsed.truncated)
  };
}

export function summarizeValue(value: ToastValue, inheritedTruncated = false): ToastValueSummary {
  const objectRefs = collectObjectRefs(value);
  const truncated = inheritedTruncated || Boolean("truncated" in value && value.truncated);

  switch (value.type) {
    case "object":
      return { type: "object", object: value.object, objectRefs, truncated, redacted: false };
    case "string":
    case "int":
    case "float":
      return { type: value.type, value: value.value, objectRefs, truncated, redacted: false };
    case "list":
      return { type: "list", items: value.items, objectRefs, truncated, redacted: false };
    case "map":
      return { type: "map", entries: value.entries, objectRefs, truncated, redacted: false };
    case "clear":
    case "none":
      return { type: value.type, objectRefs, truncated, redacted: false };
    case "error":
      return { type: "error", value: { code: value.code, name: value.name }, objectRefs, truncated, redacted: false };
    case "waif":
      return { type: "waif", value: value.summary, objectRefs, truncated, redacted: false };
    case "unknown":
      return { type: "unknown", value: value.raw ?? value.rawType, objectRefs, truncated, redacted: false };
  }
}

export function collectObjectRefs(value: ToastValue): ObjectId[] {
  const refs = new Set<ObjectId>();
  const visit = (item: ToastValue): void => {
    if (item.type === "object") refs.add(item.object);
    if (item.type === "list") item.items.forEach(visit);
    if (item.type === "map") {
      for (const entry of item.entries) {
        visit(entry.key);
        visit(entry.value);
      }
    }
  };
  visit(value);
  return [...refs];
}

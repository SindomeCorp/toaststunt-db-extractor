import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface VerbCodeWriteResult {
  codeHash: string;
  shortHash: string;
  codeLineCount: number;
  sourcePath: string;
}

export class VerbCodeWriter {
  constructor(private readonly outputDir: string) {}

  async write(objectId: number, verbIndex: number, primaryName: string, code: string): Promise<VerbCodeWriteResult> {
    const hash = createHash("sha256").update(code).digest("hex");
    const shortHash = hash.slice(0, 12);
    const safeName = safeFilenamePart(primaryName);
    const relativePath = `verb_code/${objectId.toString().padStart(10, "0")}.${verbIndex
      .toString()
      .padStart(4, "0")}.${safeName}.${shortHash}.moo`;
    await mkdir(join(this.outputDir, "verb_code"), { recursive: true });
    await writeFile(join(this.outputDir, relativePath), code, "utf8");
    return {
      codeHash: `sha256:${hash}`,
      shortHash,
      codeLineCount: code.endsWith("\n") ? code.split("\n").length - 1 : code.split("\n").length,
      sourcePath: relativePath
    };
  }
}

function safeFilenamePart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "verb";
}

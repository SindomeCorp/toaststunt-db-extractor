import type { DbCursor } from "../reader/DbCursor.js";

export interface ProgrammedVerbSource {
  objectId: number;
  verbIndex: number;
  code: string;
  line: number;
}

export async function parseProgrammedVerbs(cursor: DbCursor, count: number): Promise<ProgrammedVerbSource[]> {
  const programs: ProgrammedVerbSource[] = [];
  for (let i = 0; i < count; i += 1) {
    const headerLine = await cursor.nextLine("programmed_verbs");
    const line = cursor.lineNumber;
    const match = /^#?(-?\d+):(\d+)$/.exec(headerLine.trim());
    if (!match) {
      throw new Error(`Invalid programmed verb header at line ${line}: ${headerLine}`);
    }
    const lines: string[] = [];
    while (true) {
      const codeLine = await cursor.nextLine("programmed_verbs");
      if (codeLine === ".") break;
      lines.push(codeLine);
    }
    programs.push({
      objectId: Number.parseInt(match[1]!, 10),
      verbIndex: Number.parseInt(match[2]!, 10),
      code: `${lines.join("\n")}\n`,
      line
    });
  }
  return programs;
}

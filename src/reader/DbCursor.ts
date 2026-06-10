import { ExtractorError } from "../errors/ExtractorError.js";

export class DbCursor {
  private readonly iterator: AsyncIterator<string>;
  private buffered: string | undefined;
  lineNumber = 0;

  constructor(lines: AsyncIterable<string>) {
    this.iterator = lines[Symbol.asyncIterator]();
  }

  async nextLine(section = "database"): Promise<string> {
    if (this.buffered !== undefined) {
      const line = this.buffered;
      this.buffered = undefined;
      this.lineNumber += 1;
      return line;
    }

    const next = await this.iterator.next();
    if (next.done) {
      throw new ExtractorError("Unexpected end of database", {
        section,
        line: this.lineNumber,
        fatal: true
      });
    }
    this.lineNumber += 1;
    return next.value.replace(/\r$/, "");
  }

  async peekLine(section = "database"): Promise<string> {
    if (this.buffered === undefined) {
      const next = await this.iterator.next();
      if (next.done) {
        throw new ExtractorError("Unexpected end of database", {
          section,
          line: this.lineNumber,
          fatal: true
        });
      }
      this.buffered = next.value.replace(/\r$/, "");
    }
    return this.buffered;
  }

  async expectLine(expected: string, section = "database"): Promise<void> {
    const actual = await this.nextLine(section);
    if (actual !== expected) {
      throw new ExtractorError(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, {
        section,
        line: this.lineNumber,
        fatal: true
      });
    }
  }

  async readInt(section = "database"): Promise<number> {
    const line = await this.nextLine(section);
    const parsed = Number.parseInt(line, 10);
    if (!Number.isSafeInteger(parsed) || parsed.toString() !== line.trim()) {
      throw new ExtractorError(`Expected integer, got ${line}`, {
        section,
        line: this.lineNumber,
        fatal: true
      });
    }
    return parsed;
  }

  async readString(section = "database"): Promise<string> {
    return this.nextLine(section);
  }
}

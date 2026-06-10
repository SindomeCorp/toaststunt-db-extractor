import { createReadStream } from "node:fs";
import { createInterface, type Interface } from "node:readline";

export class LineReader implements AsyncIterable<string> {
  private readonly rl: Interface;

  constructor(path: string) {
    this.rl = createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return this.rl[Symbol.asyncIterator]();
  }

  close(): void {
    this.rl.close();
  }
}

export class ExtractorError extends Error {
  readonly section: string;
  readonly line?: number;
  readonly fatal: boolean;

  constructor(message: string, options: { section: string; line?: number; fatal?: boolean }) {
    super(message);
    this.name = "ExtractorError";
    this.section = options.section;
    if (options.line !== undefined) this.line = options.line;
    this.fatal = options.fatal ?? true;
  }
}

#!/usr/bin/env node
import { extractToastStuntDb, inspectToastStuntDb, validateToastStuntDb } from "./index.js";

interface ParsedArgs {
  command: "extract" | "inspect" | "validate";
  path: string;
  options: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.command === "inspect") {
    console.log(JSON.stringify(await inspectToastStuntDb(args.path), null, 2));
    return;
  }
  if (args.command === "validate") {
    const result = await validateToastStuntDb(args.path);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
    return;
  }

  const out = readRequiredString(args.options, "out");
  const extractOptions = {
    inputPath: args.path,
    outputDir: out,
    overwrite: Boolean(args.options.overwrite),
    includePropertyValues: args.options["property-values"] !== false,
    includeVerbCode: args.options["verb-code"] !== false,
    redactPasswordProperties: args.options["redact-password-properties"] !== false,
    pretty: Boolean(args.options.pretty),
    quiet: Boolean(args.options.quiet)
  };
  const snapshotId = readOptionalString(args.options, "snapshot-id");
  const maxValueDepth = readOptionalNumber(args.options, "max-value-depth");
  const maxStringBytes = readOptionalNumber(args.options, "max-string-bytes");
  const maxCollectionItems = readOptionalNumber(args.options, "max-collection-items");
  const result = await extractToastStuntDb({
    ...extractOptions,
    ...(snapshotId !== undefined ? { snapshotId } : {}),
    ...(maxValueDepth !== undefined ? { maxValueDepth } : {}),
    ...(maxStringBytes !== undefined ? { maxStringBytes } : {}),
    ...(maxCollectionItems !== undefined ? { maxCollectionItems } : {})
  });
  if (!args.options.quiet) {
    console.log(JSON.stringify(result, null, 2));
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const invoked = argv[1]?.split("/").at(-1) ?? "";
  const raw = argv.slice(2);
  let command: ParsedArgs["command"] = "extract";
  if (invoked.includes("inspect") || raw[0] === "inspect") command = "inspect";
  if (invoked.includes("validate") || raw[0] === "validate") command = "validate";
  if (raw[0] === "extract") command = "extract";
  if (["extract", "inspect", "validate"].includes(raw[0] ?? "")) raw.shift();
  const path = raw.shift();
  if (!path) usage();

  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i]!;
    if (!arg.startsWith("--")) usage(`Unexpected argument ${arg}`);
    if (arg.startsWith("--no-")) {
      options[arg.slice(5)] = false;
      continue;
    }
    const key = arg.slice(2);
    if (["overwrite", "include-property-values", "include-verb-code", "redact-password-properties", "pretty", "quiet"].includes(key)) {
      const normalizedKey = key.replace(/^include-/, "");
      options[normalizedKey] = true;
      continue;
    }
    const value = raw[i + 1];
    if (!value || value.startsWith("--")) usage(`Missing value for ${arg}`);
    options[key] = value;
    i += 1;
  }

  return { command, path, options };
}

function readRequiredString(options: Record<string, string | boolean>, key: string): string {
  const value = options[key];
  if (typeof value !== "string") usage(`Missing --${key}`);
  return value;
}

function readOptionalString(options: Record<string, string | boolean>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(options: Record<string, string | boolean>, key: string): number | undefined {
  const value = options[key];
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) usage(`Invalid --${key}: ${value}`);
  return parsed;
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(`Usage:
  toaststunt-db-extract <db-path> --out <output-dir> [--overwrite]
  toaststunt-db-inspect <db-path>
  toaststunt-db-validate <output-dir>`);
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

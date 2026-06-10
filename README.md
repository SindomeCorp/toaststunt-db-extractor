# toaststunt-db-extractor

Standalone Node.js/TypeScript extractor for ToastStunt checkpoint databases. It emits normalized JSONL records for objects, verbs, property definitions, property values, core object candidates, verb source files, parser errors, and extraction stats.

This package only extracts canonical structured data. It does not run Tree-sitter, build call graphs, resolve inheritance calls, create Codex context, expose an MCP server, or write graph databases.

## Install

```bash
npm install @sindomecorp/toaststunt-db-extractor
```

## CLI

After installing the package, use the scoped npm package's CLI binaries:

```bash
toaststunt-db-extract ./latest.db --out ./extract/latest --snapshot-id latest --overwrite
toaststunt-db-inspect ./latest.db
toaststunt-db-validate ./extract/latest
toaststunt-db-validate ./latest.db
```

You can also run the extractor without adding it to a project first:

```bash
npx @sindomecorp/toaststunt-db-extractor ./latest.db --out ./extract/latest --overwrite
```

Extraction options:

```text
--out <dir>
--snapshot-id <id>
--overwrite
--include-property-values / --no-property-values
--include-verb-code / --no-verb-code
--max-value-depth <n>
--max-string-bytes <n>
--max-collection-items <n>
--redact-password-properties / --no-redact-password-properties
--pretty
--quiet
```

## Library API

```ts
import {
  extractToastStuntDb,
  inspectToastStuntDb,
  validateToastStuntDb
} from "@sindomecorp/toaststunt-db-extractor";

await extractToastStuntDb({
  inputPath: "./latest.db",
  outputDir: "./extract/latest",
  snapshotId: "latest",
  overwrite: true
});

const inspect = await inspectToastStuntDb("./latest.db");
const validation = await validateToastStuntDb("./extract/latest");
```

`validateToastStuntDb()` and `toaststunt-db-validate` accept either an extraction output directory or a checkpoint DB file. Directories get artifact validation, including JSONL sanity checks and verb-code file existence. DB files get parser validation with line-numbered fatal errors.

## Output

The extractor writes:

```text
manifest.json
objects.jsonl
verbs.jsonl
properties.jsonl
property_values.jsonl
core_candidates.jsonl
verb_code/*.moo
errors.jsonl
stats.json
```

Verb IDs are stable `#object:verbIndex` IDs. Parent data is always emitted as `parents: string[]`. Programmed verb code is hashed and written under `verb_code/`.

## Privacy Behavior

By default, the extractor only redacts properties named `password`. Other property values are emitted unless truncated by size/depth limits.

The extractor does not broadly omit mail, notes, messages, logs, player data, tokens, histories, or large strings by category. Configure `--max-string-bytes`, `--max-value-depth`, and `--max-collection-items` to control safety/performance truncation.

## Known Limitations

The parser supports the native LambdaMOO/ToastStunt Format 17 layout exercised by the real Sindome checkpoint used during development, plus the small line-oriented fixture format used in tests. Other checkpoint format versions should be added behind the existing parser phase boundaries in `src/parser/`.

Object, verb, and property metadata maps are kept in memory. Property values are streamed through a temporary JSONL file and then materialized to final output with effective property names.

## Tests

For local development:

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

## Release


Releases publish to npm from GitHub Actions when a `v*` tag is pushed:

```bash
npm version patch
git push origin main --follow-tags
```

The release workflow uses npm trusted publishing and publishes `@sindomecorp/toaststunt-db-extractor` with public access.

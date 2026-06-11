import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { extractToastStuntDb, inspectToastStuntDb, validateToastStuntDb } from "../../src/index.js";

const execFileAsync = promisify(execFile);

test("extracts tiny fixture artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    const inputPath = resolve("test/fixtures/tiny.db");
    const result = await extractToastStuntDb({
      inputPath,
      outputDir,
      snapshotId: "tiny",
      overwrite: true
    });

    assert.equal(result.stats.objects, 5);
    assert.equal(result.stats.verbs, 1);
    assert.equal(result.stats.programmedVerbs, 1);
    assert.equal(result.stats.verbCodeFilesWritten, 1);
    assert.equal(result.stats.passwordPropertiesRedacted, 1);

    for (const file of [
      "manifest.json",
      "objects.jsonl",
      "verbs.jsonl",
      "properties.jsonl",
      "property_values.jsonl",
      "core_candidates.jsonl",
      "errors.jsonl",
      "stats.json"
    ]) {
      assert.match(await readFile(join(outputDir, file), "utf8"), /.*/);
    }

    const verbCodeFiles = await readdir(join(outputDir, "verb_code"));
    assert.equal(verbCodeFiles.length, 1);
    assert.match(verbCodeFiles[0]!, /^0000000030\.0000\.notify\.[a-f0-9]{12}\.moo$/);

    const coreCandidates = parseJsonl(await readFile(join(outputDir, "core_candidates.jsonl"), "utf8"));
    assert.ok(coreCandidates.some((candidate) => candidate.symbol === "$grid_utils" && candidate.target === "#30"));

    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const objects = parseJsonl(await readFile(join(outputDir, "objects.jsonl"), "utf8"));
    const verbs = parseJsonl(await readFile(join(outputDir, "verbs.jsonl"), "utf8"));
    const gridUtils = objects.find((object) => object.id === "#30");
    assert.deepEqual(gridUtils.flags, ["programmer", "fertile"]);
    assert.deepEqual(verbs[0].permissions, ["read", "write", "execute"]);
    assert.deepEqual(verbs[0].prepositions, ["none"]);
    assert.equal(verbs[0].id, "#30:0");
    assert.equal(verbs[0].hasProgram, true);

    const password = values.find((value) => value.name === "password");
    assert.equal(password.value.redacted, true);
    assert.equal(password.value.reason, "password-property");

    for (const name of ["mail", "messages", "notes", "token", "history", "log"]) {
      const value = values.find((record) => record.name === name);
      assert.ok(value, `expected ${name}`);
      assert.equal(value.value.redacted, false);
      assert.equal(typeof value.value.value, "string");
    }

    const clear = values.find((record) => record.object === "#20" && record.propertyIndex === 5);
    assert.equal(clear.value.type, "clear");
    assert.equal(clear.owner, undefined);

    const validation = await validateToastStuntDb(outputDir);
    assert.equal(validation.valid, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("preserves password values when redaction is disabled", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await extractToastStuntDb({
      inputPath: resolve("test/fixtures/tiny.db"),
      outputDir,
      overwrite: true,
      redactPasswordProperties: false
    });

    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const password = values.find((value) => value.name === "password");
    assert.equal(password.value.redacted, false);
    assert.equal(password.value.type, "string");
    assert.equal(password.value.value, "secret-value");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("CLI --no-redact-password-properties preserves password values", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await execFileAsync(process.execPath, [
      "dist/src/cli.js",
      "test/fixtures/tiny.db",
      "--out",
      outputDir,
      "--overwrite",
      "--quiet",
      "--no-redact-password-properties"
    ]);

    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const password = values.find((value) => value.name === "password");
    assert.equal(password.value.redacted, false);
    assert.equal(password.value.value, "secret-value");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("CLI --pretty keeps JSONL valid", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await execFileAsync(process.execPath, [
      "dist/src/cli.js",
      "test/fixtures/tiny.db",
      "--out",
      outputDir,
      "--overwrite",
      "--quiet",
      "--pretty"
    ]);

    const validation = await validateToastStuntDb(outputDir);
    assert.equal(validation.valid, true);
    const firstObjectLine = (await readFile(join(outputDir, "objects.jsonl"), "utf8")).split("\n")[0];
    assert.doesNotThrow(() => JSON.parse(firstObjectLine!));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("inspects fixture without full extraction", async () => {
  const result = await inspectToastStuntDb(resolve("test/fixtures/tiny.db"));
  assert.equal(result.objectSectionDetected, true);
  assert.equal(result.programmedVerbSectionDetected, true);
  assert.equal(result.objectCount, 5);
  assert.equal(result.programmedVerbCount, 1);
});

test("extracts native Format 17 fixture", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    const result = await extractToastStuntDb({
      inputPath: resolve("test/fixtures/native-small.db"),
      outputDir,
      overwrite: true
    });

    assert.equal(result.stats.objects, 2);
    assert.equal(result.stats.verbs, 1);
    assert.equal(result.stats.programmedVerbs, 1);
    assert.equal(result.stats.verbCodeFilesWritten, 1);
    assert.equal(result.stats.propertyValues, 1);

    const propertyValues = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    assert.deepEqual(propertyValues.map((value) => value.name), ["grid_utils"]);
    assert.equal(propertyValues[0].propertyIndex, 0);
    assert.equal(propertyValues[0].value.object, "#1");

    const coreCandidates = parseJsonl(await readFile(join(outputDir, "core_candidates.jsonl"), "utf8"));
    assert.deepEqual(coreCandidates[0], {
      kind: "core_candidate",
      symbol: "$grid_utils",
      property: "grid_utils",
      sourceObject: "#0",
      target: "#1",
      confidence: "object-property-on-root"
    });
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("inspects native Format 17 fixture through programmed verb count", async () => {
  const result = await inspectToastStuntDb(resolve("test/fixtures/native-small.db"));
  assert.equal(result.objectSectionDetected, true);
  assert.equal(result.programmedVerbSectionDetected, true);
  assert.equal(result.objectCount, 2);
  assert.equal(result.programmedVerbCount, 1);
  assert.deepEqual(result.warnings, []);
});

test("validate accepts DB files and reports corrupt line numbers", async () => {
  const valid = await validateToastStuntDb(resolve("test/fixtures/tiny.db"));
  assert.equal(valid.valid, true);
  assert.equal(valid.stats?.objects, 5);

  const corrupt = await validateToastStuntDb(resolve("test/fixtures/corrupt.db"));
  assert.equal(corrupt.valid, false);
  assert.equal(corrupt.errors[0]?.section, "objects");
  assert.equal(corrupt.errors[0]?.line, 4);
});

test("configured string truncation preserves parser alignment", async () => {
  const fixturePath = join(await mkdtemp(join(tmpdir(), "toaststunt-fixture-")), "large.db");
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await writeFile(fixturePath, fixtureDb([
      objectRecord({
        id: 1,
        name: "Large",
        parents: "-",
        properties: ["log"],
        values: [{ index: 0, raw: "\"abcdefghijklmnopqrstuvwxyz\"", owner: "#2", perms: 5 }]
      })
    ]), "utf8");

    await extractToastStuntDb({
      inputPath: fixturePath,
      outputDir,
      overwrite: true,
      maxStringBytes: 5
    });

    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    assert.equal(values[0].value.value, "abcde");
    assert.equal(values[0].value.truncated, true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(join(fixturePath, ".."), { recursive: true, force: true });
  }
});

test("multiple parents produce computed-multiple-inheritance property confidence", async () => {
  const fixturePath = join(await mkdtemp(join(tmpdir(), "toaststunt-fixture-")), "multi.db");
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await writeFile(fixturePath, fixtureDb([
      objectRecord({
        id: 10,
        name: "Parent A",
        parents: "-",
        children: "#20",
        properties: ["alpha"],
        values: []
      }),
      objectRecord({
        id: 11,
        name: "Parent B",
        parents: "-",
        children: "#20",
        properties: ["beta"],
        values: []
      }),
      objectRecord({
        id: 20,
        name: "Child",
        parents: "#10 #11",
        properties: [],
        values: [
          { index: 0, raw: "\"a\"", owner: "#2", perms: 5 },
          { index: 1, raw: "\"b\"", owner: "#2", perms: 5 }
        ]
      })
    ]), "utf8");

    await extractToastStuntDb({ inputPath: fixturePath, outputDir, overwrite: true });
    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const childValues = values.filter((value) => value.object === "#20");
    assert.deepEqual(childValues.map((value) => value.name), ["alpha", "beta"]);
    assert.deepEqual(childValues.map((value) => value.nameConfidence), [
      "computed-multiple-inheritance",
      "computed-multiple-inheritance"
    ]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(join(fixturePath, ".."), { recursive: true, force: true });
  }
});

test("effective property names use object definitions before inherited definitions", async () => {
  const fixturePath = join(await mkdtemp(join(tmpdir(), "toaststunt-fixture-")), "self-first.db");
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await writeFile(fixturePath, fixtureDb([
      objectRecord({
        id: 10,
        name: "Root",
        parents: "-",
        children: "#20",
        properties: ["key", "aliases", "description", "object_size"],
        values: []
      }),
      objectRecord({
        id: 20,
        name: "System",
        parents: "#10",
        properties: ["command_utils"],
        values: [
          { index: 0, raw: "#56", owner: "#2", perms: 5 },
          { index: 1, raw: "\"root-key\"", owner: "#2", perms: 5 }
        ]
      })
    ]), "utf8");

    await extractToastStuntDb({ inputPath: fixturePath, outputDir, overwrite: true });
    const values = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const childValues = values.filter((value) => value.object === "#20");
    assert.deepEqual(childValues.map((value) => value.name), ["command_utils", "key"]);
    assert.equal(childValues[0].nameConfidence, "direct");
    assert.equal(childValues[0].value.object, "#56");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(join(fixturePath, ".."), { recursive: true, force: true });
  }
});

test("core candidates emit DB-level #0 object refs without resolving code references", async () => {
  const fixturePath = join(await mkdtemp(join(tmpdir(), "toaststunt-fixture-")), "core.db");
  const outputDir = await mkdtemp(join(tmpdir(), "toaststunt-extract-"));
  try {
    await writeFile(fixturePath, [
      "TOASTSTUNT-DB-EXTRACTOR-FIXTURE 1",
      "objects",
      "2",
      objectRecord({
        id: 0,
        name: "System Object",
        parents: "-",
        children: "#20",
        properties: ["string_utils", "some_collection"],
        values: [
          { index: 0, raw: "#20", owner: "#2", perms: 5 },
          { index: 1, raw: "[#1,#2,#3]", owner: "#2", perms: 5 }
        ]
      }),
      [
        "20",
        "String Utils",
        "0",
        "#2",
        "#-1",
        "1",
        "#0",
        "-",
        "-",
        "1",
        "trim|#2|13|0",
        "0",
        "0"
      ].join("\n"),
      "programmed_verbs",
      "1",
      "#20:0",
      "$string_utils:trim(foo);",
      ".",
      ""
    ].join("\n"), "utf8");

    await extractToastStuntDb({ inputPath: fixturePath, outputDir, overwrite: true });

    const coreCandidates = parseJsonl(await readFile(join(outputDir, "core_candidates.jsonl"), "utf8"));
    assert.deepEqual(coreCandidates, [
      {
        kind: "core_candidate",
        symbol: "$string_utils",
        property: "string_utils",
        sourceObject: "#0",
        target: "#20",
        confidence: "object-property-on-root"
      },
      {
        kind: "core_collection_candidate",
        symbol: "$some_collection",
        property: "some_collection",
        sourceObject: "#0",
        objectRefs: ["#1", "#2", "#3"],
        confidence: "collection-property-on-root"
      }
    ]);

    const propertyValues = parseJsonl(await readFile(join(outputDir, "property_values.jsonl"), "utf8"));
    const stringUtils = propertyValues.find((value) => value.object === "#0" && value.name === "string_utils");
    assert.equal(stringUtils.value.type, "object");
    assert.equal(stringUtils.value.object, "#20");
    assert.deepEqual(stringUtils.value.objectRefs, ["#20"]);

    const joinedOutput = [
      await readFile(join(outputDir, "core_candidates.jsonl"), "utf8"),
      await readFile(join(outputDir, "property_values.jsonl"), "utf8"),
      await readFile(join(outputDir, "verbs.jsonl"), "utf8")
    ].join("\n");
    assert.equal(joinedOutput.includes("#20:trim"), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(join(fixturePath, ".."), { recursive: true, force: true });
  }
});

function parseJsonl(text: string): any[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fixtureDb(objects: string[]): string {
  return [
    "TOASTSTUNT-DB-EXTRACTOR-FIXTURE 1",
    "objects",
    String(objects.length),
    ...objects,
    "programmed_verbs",
    "0",
    ""
  ].join("\n");
}

function objectRecord(input: {
  id: number;
  name: string;
  parents: string;
  children?: string;
  properties: string[];
  values: Array<{ index: number; raw: string; owner: string; perms: number }>;
}): string {
  return [
    String(input.id),
    input.name,
    "0",
    "#2",
    "#-1",
    "1",
    input.parents,
    input.children ?? "-",
    "-",
    "0",
    String(input.properties.length),
    ...input.properties,
    String(input.values.length),
    ...input.values.flatMap((value) => [String(value.index), value.raw, value.owner, String(value.perms)])
  ].join("\n");
}

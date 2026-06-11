import test from "node:test";
import assert from "node:assert/strict";
import {
  type CoreCandidateRecord,
  type ExtractErrorRecord,
  type ExtractManifest,
  type ExtractStats,
  type ExtractedJsonlRecord,
  type ExtractedObjectRecord,
  type ExtractedPropertyDefinitionRecord,
  type ExtractedPropertyValueRecord,
  type ExtractedValue,
  type ExtractedVerbRecord,
  type ObjectRef
} from "../../src/index.js";
import {
  extractToastStuntDb,
  type ExtractedVerbRecord as BuiltOutputExtractedVerbRecord
} from "../../index.js";

test("exports downstream TypeScript schema types from package roots", () => {
  const objectRef: ObjectRef = "#20";
  const manifest: ExtractManifest = {
    snapshotId: "latest",
    format: { server: "toaststunt", dbVersion: "17" }
  };
  const object: ExtractedObjectRecord = {
    kind: "object",
    objectId: 20,
    id: objectRef,
    parents: ["#1"],
    recycled: false
  };
  const verb: ExtractedVerbRecord = {
    kind: "verb",
    id: "#20:0",
    objectId: 20,
    object: "#20",
    verbIndex: 0,
    names: ["test"],
    hasProgram: true,
    sourcePath: "verb_code/0000000020.0000.test.abc123.moo"
  };
  const builtVerb: BuiltOutputExtractedVerbRecord = verb;
  const propertyDefinition: ExtractedPropertyDefinitionRecord = {
    kind: "property_definition",
    id: "#20.string_utils",
    objectId: 20,
    object: "#20",
    name: "string_utils",
    definitionIndex: 0
  };
  const value: ExtractedValue = {
    type: "object",
    object: "#20",
    objectRefs: ["#20"],
    truncated: false,
    redacted: false
  };
  const propertyValue: ExtractedPropertyValueRecord = {
    kind: "property_value",
    objectId: 0,
    object: "#0",
    propertyIndex: 0,
    name: "string_utils",
    nameConfidence: "computed",
    value
  };
  const candidate: CoreCandidateRecord = {
    kind: "core_candidate",
    symbol: "$string_utils",
    property: "string_utils",
    sourceObject: "#0",
    target: "#20",
    confidence: "object-property-on-root"
  };
  const error: ExtractErrorRecord = {
    fatal: false,
    section: "programmed_verbs",
    message: "Programmed verb #20:99 had no matching verb metadata",
    object: "#20",
    verbIndex: 99
  };
  const stats: ExtractStats = {
    objectCount: 1,
    recycledObjectCount: 0,
    verbMetadataCount: 1,
    programmedVerbCount: 1,
    propertyDefinitionCount: 1,
    propertyValueCount: 1,
    verbCodeFileCount: 1,
    coreCandidateCount: 1,
    warningCount: 1,
    fatalErrorCount: 0,
    passwordPropertiesRedacted: 0,
    objects: 1,
    verbs: 1,
    programmedVerbs: 1,
    properties: 1,
    propertyValues: 1,
    verbCodeFilesWritten: 1,
    coreCandidates: 1,
    warnings: 1,
    errors: 0
  };
  const records: ExtractedJsonlRecord[] = [object, builtVerb, propertyDefinition, propertyValue, candidate, error];

  assert.equal(typeof extractToastStuntDb, "function");
  assert.equal(manifest.snapshotId, "latest");
  assert.equal(stats.verbMetadataCount, 1);
  assert.equal(records.length, 6);
});

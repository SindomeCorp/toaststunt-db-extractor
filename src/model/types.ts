export type ObjectRef = `#${number}`;
export type ObjectId = ObjectRef;

export interface ExtractToastStuntDbOptions {
  inputPath: string;
  outputDir: string;
  snapshotId?: string;
  overwrite?: boolean;
  includeVerbCode?: boolean;
  includePropertyValues?: boolean;
  maxValueDepth?: number;
  maxStringBytes?: number;
  maxCollectionItems?: number;
  redactPasswordProperties?: boolean;
  pretty?: boolean;
  quiet?: boolean;
  onProgress?: (event: ExtractProgressEvent) => void;
}

export interface NormalizedExtractOptions extends Required<Omit<ExtractToastStuntDbOptions, "snapshotId" | "onProgress">> {
  snapshotId: string;
  onProgress?: (event: ExtractProgressEvent) => void;
}

export interface ExtractProgressEvent {
  phase:
    | "inspect"
    | "objects"
    | "programmed_verbs"
    | "property_values"
    | "core_candidates"
    | "write_manifest"
    | "done"
    | "parse"
    | "emit";
  message?: string;
  current?: number;
  total?: number;
  count?: number;
}

export interface ExtractResult {
  snapshotId: string;
  outputDir: string;
  stats: ExtractStats;
  errors?: ExtractErrorRecord[];
}

export interface InspectResult {
  sourcePath: string;
  sourceSizeBytes: number;
  sourceMtime: string;
  format: {
    server: "toaststunt";
    dbVersion: string;
  };
  objectCount?: number;
  programmedVerbCount?: number;
  objectSectionDetected: boolean;
  programmedVerbSectionDetected: boolean;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ExtractErrorSummary[];
  warnings: ExtractErrorSummary[];
  stats?: ExtractStats;
}

export interface ExtractErrorRecord {
  fatal: boolean;
  section?: string;
  phase?: string;
  line?: number;
  message: string;
  context?: Record<string, unknown>;
  object?: ObjectRef;
  verbIndex?: number;
}

export type ExtractErrorSummary = ExtractErrorRecord;

export interface ExtractStats {
  objectCount: number;
  recycledObjectCount: number;
  verbMetadataCount: number;
  programmedVerbCount: number;
  propertyDefinitionCount: number;
  propertyValueCount: number;
  verbCodeFileCount: number;
  coreCandidateCount: number;
  warningCount: number;
  fatalErrorCount: number;
  passwordPropertiesRedacted?: number;
  /**
   * @deprecated Use objectCount.
   */
  objects: number;
  /**
   * @deprecated Use verbMetadataCount.
   */
  verbs: number;
  /**
   * @deprecated Use programmedVerbCount.
   */
  programmedVerbs: number;
  /**
   * @deprecated Use propertyDefinitionCount.
   */
  properties: number;
  /**
   * @deprecated Use propertyValueCount.
   */
  propertyValues: number;
  /**
   * @deprecated Use verbCodeFileCount.
   */
  verbCodeFilesWritten: number;
  /**
   * @deprecated Use coreCandidateCount.
   */
  coreCandidates: number;
  /**
   * @deprecated Use fatalErrorCount.
   */
  errors: number;
  /**
   * @deprecated Use warningCount.
   */
  warnings: number;
}

export interface ExtractManifest {
  snapshotId: string;
  sourcePath?: string;
  sourceSizeBytes?: number;
  sourceMtime?: string;
  extractorVersion?: string;
  startedAt?: string;
  completedAt?: string;
  format?: {
    server?: string;
    dbVersion?: string;
  };
  options?: Record<string, unknown>;
}

export interface DbHeader {
  dbVersion: string;
  rawHeaderLines: string[];
}

export interface ObjectRecord {
  kind: "object";
  objectId: number;
  id: ObjectId;
  name?: string;
  owner?: ObjectId;
  location?: ObjectId;
  lastMove?: number;
  parents: ObjectId[];
  children?: ObjectId[];
  contents?: ObjectId[];
  flagsRaw?: number;
  flags?: string[];
  verbCount?: number;
  propertyDefinitionCount?: number;
  propertyValueCount?: number;
  recycled: boolean;
}

export type ExtractedObjectRecord = ObjectRecord;

export interface VerbRecord {
  kind: "verb";
  id: `${ObjectId}:${number}`;
  objectId: number;
  object: ObjectId;
  verbIndex: number;
  namesRaw?: string;
  names: string[];
  primaryName?: string;
  owner?: ObjectId;
  permissionsRaw?: number;
  permissions?: string[];
  prepositionsRaw?: number;
  prepositions?: string[];
  codeHash?: string;
  codeLineCount?: number;
  sourcePath?: string;
  hasProgram: boolean;
}

export type ExtractedVerbRecord = VerbRecord;

export interface PropertyDefinitionRecord {
  kind: "property_definition";
  id: string;
  objectId: number;
  object: ObjectId;
  name: string;
  definitionIndex: number;
}

export type ExtractedPropertyDefinitionRecord = PropertyDefinitionRecord;

export type NameConfidence = "direct" | "computed" | "computed-multiple-inheritance" | "unknown";

export interface PropertyValueRecord {
  kind: "property_value";
  objectId: number;
  object: ObjectId;
  propertyIndex: number;
  name: string | null;
  nameConfidence: NameConfidence;
  owner?: ObjectId;
  permissionsRaw?: number;
  permissions?: string[];
  definedOn?: ObjectRef;
  value: ExtractedValue;
}

export type ExtractedPropertyValueRecord = PropertyValueRecord;

export type CoreCandidateRecord = CoreObjectCandidateRecord | CoreCollectionCandidateRecord;

export interface CoreObjectCandidateRecord {
  kind: "core_candidate";
  symbol: `$${string}`;
  property: string;
  sourceObject: ObjectRef;
  target: ObjectRef;
  confidence: "object-property-on-root" | string;
}

export interface CoreCollectionCandidateRecord {
  kind: "core_collection_candidate";
  symbol: `$${string}`;
  property: string;
  sourceObject: ObjectRef;
  objectRefs: ObjectRef[];
  confidence: "collection-property-on-root" | string;
}

export type ExtractedValue =
  | ExtractedClearValue
  | ExtractedNoneValue
  | ExtractedIntValue
  | ExtractedFloatValue
  | ExtractedStringValue
  | ExtractedObjectValue
  | ExtractedErrorValue
  | ExtractedListValue
  | ExtractedMapValue
  | ExtractedRedactedValue
  | ExtractedTruncatedValue
  | ExtractedUnknownValue
  | ExtractedWaifValue
  | ToastValueSummary;

export interface ExtractedValueBase {
  type: string;
  value?: unknown;
  objectRefs?: ObjectRef[];
  truncated?: boolean;
  redacted?: boolean;
}

export interface ExtractedClearValue extends ExtractedValueBase {
  type: "clear";
}

export interface ExtractedNoneValue extends ExtractedValueBase {
  type: "none";
}

export interface ExtractedIntValue extends ExtractedValueBase {
  type: "int";
  value: number | string;
}

export interface ExtractedFloatValue extends ExtractedValueBase {
  type: "float";
  value: number | string;
}

export interface ExtractedStringValue extends ExtractedValueBase {
  type: "string";
  value: string;
}

export interface ExtractedObjectValue extends ExtractedValueBase {
  type: "object";
  object: ObjectRef;
}

export interface ExtractedErrorValue extends ExtractedValueBase {
  type: "error";
  name?: string;
  code?: number;
}

export interface ExtractedListValue extends ExtractedValueBase {
  type: "list";
  items: ExtractedValue[];
}

export interface ExtractedMapEntry {
  key: ExtractedValue;
  value: ExtractedValue;
}

export interface ExtractedMapValue extends ExtractedValueBase {
  type: "map";
  entries?: ExtractedMapEntry[];
  value?: Record<string, unknown>;
}

export interface ExtractedRedactedValue extends ExtractedValueBase {
  type: "redacted";
  reason: string;
  redacted: true;
}

export interface ExtractedTruncatedValue extends ExtractedValueBase {
  type: "truncated";
  reason: string;
  truncated: true;
}

export interface ExtractedUnknownValue extends ExtractedValueBase {
  type: "unknown";
  rawType?: number | string;
  raw?: string;
}

export interface ExtractedWaifValue extends ExtractedValueBase {
  type: "waif";
  summary?: unknown;
}

export type ToastValue = ExtractedValue;

export interface ToastMapEntry {
  key: ExtractedValue;
  value: ExtractedValue;
}

export interface ToastValueSummary extends ExtractedValueBase {
  entries?: ExtractedMapEntry[];
  items?: ExtractedValue[];
  object?: ObjectRef;
  truncated: boolean;
  redacted: boolean;
  reason?: string;
  name?: string;
  code?: number;
  rawType?: number | string;
  raw?: string;
  summary?: unknown;
}

export interface EffectiveProperty {
  name: string;
  definedOn: ObjectId;
  confidence: NameConfidence;
}

export interface ParsedDatabase {
  header: DbHeader;
  objects: ObjectRecord[];
  verbs: VerbRecord[];
  properties: PropertyDefinitionRecord[];
  propertyValues: PropertyValueRecord[];
  coreCandidates: CoreCandidateRecord[];
  programs: Array<{ objectId: number; verbIndex: number; code: string; line: number }>;
  errors: ExtractErrorSummary[];
  stats: ExtractStats;
}

export type ExtractedJsonlRecord =
  | ExtractedObjectRecord
  | ExtractedVerbRecord
  | ExtractedPropertyDefinitionRecord
  | ExtractedPropertyValueRecord
  | CoreCandidateRecord
  | ExtractErrorRecord;

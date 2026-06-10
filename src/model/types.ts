export type ObjectId = `#${number}`;

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
  phase: string;
  message?: string;
  count?: number;
}

export interface ExtractResult {
  snapshotId: string;
  outputDir: string;
  stats: ExtractStats;
  errors: ExtractErrorSummary[];
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

export interface ExtractErrorSummary {
  fatal: boolean;
  section: string;
  line?: number;
  message: string;
  object?: ObjectId;
  verbIndex?: number;
}

export interface ExtractStats {
  objects: number;
  verbs: number;
  programmedVerbs: number;
  properties: number;
  propertyValues: number;
  verbCodeFilesWritten: number;
  coreCandidates: number;
  errors: number;
  warnings: number;
  passwordPropertiesRedacted: number;
}

export interface DbHeader {
  dbVersion: string;
  rawHeaderLines: string[];
}

export interface ObjectRecord {
  kind: "object";
  objectId: number;
  id: ObjectId;
  name: string;
  owner: ObjectId;
  location: ObjectId;
  lastMove: number;
  parents: ObjectId[];
  children: ObjectId[];
  contents: ObjectId[];
  flagsRaw: number;
  flags: string[];
  verbCount: number;
  propertyDefinitionCount: number;
  propertyValueCount: number;
  recycled: boolean;
}

export interface VerbRecord {
  kind: "verb";
  id: `${ObjectId}:${number}`;
  objectId: number;
  object: ObjectId;
  verbIndex: number;
  namesRaw: string;
  names: string[];
  primaryName: string;
  owner: ObjectId;
  permissionsRaw: number;
  permissions: string[];
  prepositionsRaw: number;
  prepositions: string[];
  codeHash?: string;
  codeLineCount?: number;
  sourcePath?: string;
  hasProgram: boolean;
}

export interface PropertyDefinitionRecord {
  kind: "property_definition";
  id: string;
  objectId: number;
  object: ObjectId;
  name: string;
  definitionIndex: number;
}

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
  value: ToastValueSummary;
}

export interface CoreCandidateRecord {
  kind: "core_candidate" | "core_collection_candidate";
  symbol: string;
  property: string;
  sourceObject: ObjectId;
  target?: ObjectId;
  objectRefs?: ObjectId[];
  confidence: "object-property-on-root" | "collection-property-on-root";
}

export type ToastValue =
  | { type: "clear" }
  | { type: "none" }
  | { type: "int"; value: number | string }
  | { type: "float"; value: number | string }
  | { type: "string"; value: string; truncated?: boolean }
  | { type: "object"; object: ObjectId }
  | { type: "error"; name?: string; code?: number }
  | { type: "list"; items: ToastValue[]; truncated?: boolean }
  | { type: "map"; entries: ToastMapEntry[]; truncated?: boolean }
  | { type: "waif"; summary: unknown; truncated?: boolean }
  | { type: "unknown"; rawType: number | string; raw?: string };

export interface ToastMapEntry {
  key: ToastValue;
  value: ToastValue;
}

export interface ToastValueSummary {
  type: string;
  value?: unknown;
  entries?: ToastMapEntry[];
  items?: ToastValue[];
  object?: ObjectId;
  objectRefs?: ObjectId[];
  truncated: boolean;
  redacted: boolean;
  reason?: string;
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

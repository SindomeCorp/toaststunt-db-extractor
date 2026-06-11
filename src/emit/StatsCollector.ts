import type { ExtractStats } from "../model/types.js";

export function createEmptyStats(): ExtractStats {
  return {
    objectCount: 0,
    recycledObjectCount: 0,
    verbMetadataCount: 0,
    programmedVerbCount: 0,
    propertyDefinitionCount: 0,
    propertyValueCount: 0,
    verbCodeFileCount: 0,
    coreCandidateCount: 0,
    warningCount: 0,
    fatalErrorCount: 0,
    passwordPropertiesRedacted: 0,
    objects: 0,
    verbs: 0,
    programmedVerbs: 0,
    properties: 0,
    propertyValues: 0,
    verbCodeFilesWritten: 0,
    coreCandidates: 0,
    errors: 0,
    warnings: 0
  };
}

export function syncStatsCounters(stats: ExtractStats): ExtractStats {
  stats.objectCount = stats.objects;
  stats.recycledObjectCount = stats.recycledObjectCount ?? 0;
  stats.verbMetadataCount = stats.verbs;
  stats.programmedVerbCount = stats.programmedVerbs;
  stats.propertyDefinitionCount = stats.properties;
  stats.propertyValueCount = stats.propertyValues;
  stats.verbCodeFileCount = stats.verbCodeFilesWritten;
  stats.coreCandidateCount = stats.coreCandidates;
  stats.warningCount = stats.warnings;
  stats.fatalErrorCount = stats.errors;
  return stats;
}

import type { ExtractStats } from "../model/types.js";

export function createEmptyStats(): ExtractStats {
  return {
    objects: 0,
    verbs: 0,
    programmedVerbs: 0,
    properties: 0,
    propertyValues: 0,
    verbCodeFilesWritten: 0,
    coreCandidates: 0,
    errors: 0,
    warnings: 0,
    passwordPropertiesRedacted: 0
  };
}

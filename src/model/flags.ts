const OBJECT_FLAGS: Array<[number, string]> = [
  [1, "programmer"],
  [2, "wizard"],
  [4, "read"],
  [8, "write"],
  [16, "fertile"],
  [32, "player"],
  [256, "anonymous"],
  [512, "invalid"],
  [1024, "recycled"]
];

export function decodeObjectFlags(flagsRaw: number): string[] {
  return OBJECT_FLAGS.filter(([bit]) => (flagsRaw & bit) !== 0).map(([, name]) => name);
}

export function isRecycled(flagsRaw: number): boolean {
  return (flagsRaw & 1024) !== 0;
}

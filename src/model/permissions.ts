const PERMISSION_FLAGS: Array<[number, string]> = [
  [1, "read"],
  [4, "write"],
  [8, "execute"],
  [2, "debug"],
  [16, "dobj"],
  [32, "iobj"]
];

export function decodePermissions(raw: number): string[] {
  return PERMISSION_FLAGS.filter(([bit]) => (raw & bit) !== 0).map(([, name]) => name);
}

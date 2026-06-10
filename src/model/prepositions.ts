const PREPOSITIONS = new Map<number, string[]>([
  [-2, ["any"]],
  [-1, ["none"]],
  [0, ["none"]],
  [1, ["with/using"]],
  [2, ["at/to"]],
  [3, ["in front of"]],
  [4, ["in/inside/into"]],
  [5, ["on top of/on/onto/upon"]],
  [6, ["out of/from inside/from"]],
  [7, ["over"]],
  [8, ["through"]],
  [9, ["under/underneath/beneath"]],
  [10, ["behind"]],
  [11, ["beside"]],
  [12, ["for/about"]],
  [13, ["is"]],
  [14, ["as"]],
  [15, ["off/off of"]]
]);

export function decodePrepositions(raw: number): string[] {
  return PREPOSITIONS.get(raw) ?? [`unknown:${raw}`];
}

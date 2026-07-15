export function deriveAiOwners<T>(
  owners: readonly T[],
  predicate: (owner: T) => boolean,
): T[] {
  return owners.filter(predicate);
}

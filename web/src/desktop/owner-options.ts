export function deriveAiOwners<T, MatchingOwner extends T>(
  owners: readonly T[],
  predicate: (owner: T) => owner is MatchingOwner,
): MatchingOwner[];
export function deriveAiOwners<T>(
  owners: readonly T[],
  predicate: (owner: T) => boolean,
): T[];
export function deriveAiOwners<T>(owners: readonly T[], predicate: (owner: T) => boolean): T[] {
  return owners.filter(predicate);
}

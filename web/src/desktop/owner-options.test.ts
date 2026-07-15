import { describe, expect, it } from 'vitest';
import { deriveAiOwners } from './owner-options';

describe('deriveAiOwners', () => {
  it('readonly の入力を predicate で絞り込み、元の順序で返す', () => {
    const owners = ['human', 'codex', 'cowork'] as const;

    const result: Array<(typeof owners)[number]> = deriveAiOwners(
      owners,
      (owner) => owner !== 'human',
    );

    expect(result).toEqual(['codex', 'cowork']);
  });
});

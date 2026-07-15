import { describe, expect, it } from 'vitest';
import { deriveAiOwners } from './owner-options';

describe('deriveAiOwners', () => {
  it('readonly の入力を predicate で絞り込み、元の順序で返す', () => {
    const owners = ['human', 'codex', 'cowork'] as const;
    type Owner = (typeof owners)[number];
    type AiOwner = Exclude<Owner, 'human'>;
    const isAiOwner = (owner: Owner): owner is AiOwner => owner !== 'human';

    const result: AiOwner[] = deriveAiOwners(owners, isAiOwner);

    expect(result).toEqual(['codex', 'cowork']);
  });
});

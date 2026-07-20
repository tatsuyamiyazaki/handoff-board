import { describe, it, test, expect } from 'vitest';
import {
  loadAllowedEmails,
  loadAllowedEmailDomains,
  loadBoardTokens,
  loadReviewCycleLimit,
} from '../src/config.js';

describe('loadBoardTokens の actor 形式検証（ADR-0008）', () => {
  test('owner 単独と owner:機能 は受理する', () => {
    const raw = JSON.stringify({
      t1: 'cowork',
      t2: 'claude-code:dev',
      t3: 'claude-code:ceo',
    });
    expect(loadBoardTokens(raw)).toEqual({
      t1: 'cowork',
      t2: 'claude-code:dev',
      t3: 'claude-code:ceo',
    });
  });

  test.each([
    [':dev', 'owner が空'],
    ['claude-code:', '機能が空'],
    ['a:b:c', 'コロン複数'],
    ['', '空文字'],
    ['claude code', '空白'],
    ['claude-code:dev ops', '機能内の空白'],
    ['claude-code:\nreview', '制御文字'],
    ['claude-code:\u0085review', 'C1 制御文字'],
  ])('不正な actor 形式 %s（%s）は起動時に throw する', (actor) => {
    expect(() => loadBoardTokens(JSON.stringify({ token: actor }))).toThrow(/actor/);
  });

  test('actor が文字列でない値は throw する', () => {
    expect(() => loadBoardTokens('{"token": 42}')).toThrow(/actor/);
  });

  test('形式エラーに bearer token の値を含めない', () => {
    const sentinel = 'super-secret-board-token';
    expect(() => loadBoardTokens(JSON.stringify({ [sentinel]: ':invalid' }))).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(sentinel) }),
    );
  });
});

describe('loadAllowedEmails', () => {
  it('未設定なら空配列', () => {
    expect(loadAllowedEmails(undefined)).toEqual([]);
  });

  it('カンマ区切りを trim・小文字化する', () => {
    expect(loadAllowedEmails('A@Example.com , b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });
});

describe('loadAllowedEmailDomains', () => {
  it('未設定なら空配列', () => {
    expect(loadAllowedEmailDomains(undefined)).toEqual([]);
  });

  it('カンマ区切りを trim・小文字化し、先頭 @ を除去する', () => {
    expect(loadAllowedEmailDomains('SunBit.co.jp, @example.com')).toEqual([
      'sunbit.co.jp',
      'example.com',
    ]);
  });

  it('空要素は除外する', () => {
    expect(loadAllowedEmailDomains('sunbit.co.jp, ,')).toEqual(['sunbit.co.jp']);
  });
});

describe('loadReviewCycleLimit（ADR-0007）', () => {
  it('未設定なら既定値 5', () => {
    expect(loadReviewCycleLimit(undefined)).toBe(5);
  });

  it('正の整数文字列を受理する', () => {
    expect(loadReviewCycleLimit('3')).toBe(3);
  });

  test.each(['0', '-1', '2.5', 'abc', '9007199254740992'])(
    '不正値 %s は throw する',
    (raw) => {
      expect(() => loadReviewCycleLimit(raw)).toThrow(/REVIEW_CYCLE_LIMIT/);
    },
  );
});

import { describe, it, expect } from 'vitest';
import { loadAllowedEmails, loadAllowedEmailDomains } from '../src/config.js';

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

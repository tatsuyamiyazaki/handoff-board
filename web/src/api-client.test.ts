import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBoard, setApiBase } from './api-client';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data, error: null }),
  } as unknown as Response;
}

afterEach(() => {
  setApiBase('');
  vi.restoreAllMocks();
});

describe('setApiBase', () => {
  it('デスクトップ設定の URL で API を呼ぶ', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    setApiBase('http://desktop.example:9999');
    await fetchBoard();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://desktop.example:9999/api/board',
      expect.anything(),
    );
  });

  it('空文字はビルド時既定（テストでは localhost:8787）に戻す', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    setApiBase('http://desktop.example:9999');
    setApiBase('');
    await fetchBoard();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/board', expect.anything());
  });
});

// 全 API レスポンス共通の封筒（docs/prd.md §API コントラクト）。

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null };
}

export function fail(error: string): ApiEnvelope<never> {
  return { success: false, data: null, error };
}

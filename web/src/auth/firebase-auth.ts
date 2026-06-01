// Firebase Authentication（Google サインイン）クライアントラッパー（配線のみ）。
// VITE_FIREBASE_* が未設定なら未構成として振る舞い、api-client は X-Board-Token にフォールバックする。
// Firebase プロジェクト作成・Google プロバイダ有効化は HITL セットアップ前提（ADR-0001 / Issue #02）。

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

const configured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

let app: FirebaseApp | undefined;
function ensureApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

/** Firebase 構成が揃っているか（未構成なら人間サインインは無効）。 */
export function isAuthConfigured(): boolean {
  return configured;
}

/** Google ポップアップでサインインする。未構成時は例外。 */
export async function signInWithGoogle(): Promise<void> {
  if (!configured) throw new Error('Firebase が未構成です（VITE_FIREBASE_* を設定してください）');
  await signInWithPopup(getAuth(ensureApp()), new GoogleAuthProvider());
}

/** サインアウトする。 */
export async function signOutUser(): Promise<void> {
  if (!configured) return;
  await signOut(getAuth(ensureApp()));
}

/** ログイン状態の変化を購読し、当人のメール（未ログインは null）を通知する。戻り値は解除関数。 */
export function onUserChange(callback: (email: string | null) => void): () => void {
  if (!configured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getAuth(ensureApp()), (user: User | null) =>
    callback(user?.email ?? null),
  );
}

/** 現在のユーザーの ID トークン（未ログイン/未構成は null）。 */
export async function currentIdToken(): Promise<string | null> {
  if (!configured) return null;
  const user = getAuth(ensureApp()).currentUser;
  return user ? user.getIdToken() : null;
}

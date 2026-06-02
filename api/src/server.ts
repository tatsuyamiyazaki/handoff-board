import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { buildApp } from './app.js';
import {
  loadBoardTokens,
  loadAllowedEmails,
  loadAllowedEmailDomains,
  loadCorsOrigins,
} from './config.js';
import type { AuthConfig, TokenVerifier } from './auth/auth-middleware.js';
import { FirebaseTokenVerifier } from './auth/firebase-token-verifier.js';
import { FirestoreTaskRepository } from './repository/firestore-task-repository.js';
import { InMemoryTaskRepository } from './repository/in-memory-task-repository.js';
import type { TaskRepository } from './repository/task-repository.js';
import { devSeed } from './dev-seed.js';

// Firestore（エミュレータ or 本番）に繋がる構成なら Firebase を初期化し、
// Firestore リポジトリと ID トークン検証器を生成する。
// Java/firebase CLI 未導入のローカルでは初期化せず、in-memory + シードで起動する（人間パスは利用不可）。
function createBackend(): { repository: TaskRepository; tokenVerifier?: TokenVerifier } {
  // Firestore を使う条件:
  //  - エミュレータ接続 / ローカルの SA キー（GOOGLE_APPLICATION_CREDENTIALS）
  //  - 明示フラグ USE_FIRESTORE（Cloud Run など ADC がメタデータ経由のとき用）
  //  - Cloud Run 実行時に自動付与される K_SERVICE（保険の自動検出）
  const useFirebase =
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.USE_FIRESTORE ||
    process.env.K_SERVICE;
  if (!useFirebase) {
    return { repository: new InMemoryTaskRepository(devSeed) };
  }

  initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : undefined,
    projectId: process.env.GCLOUD_PROJECT,
  });
  return {
    repository: new FirestoreTaskRepository(getFirestore()),
    tokenVerifier: new FirebaseTokenVerifier(getAuth()),
  };
}

const { repository, tokenVerifier } = createBackend();
const auth: AuthConfig = {
  boardTokens: loadBoardTokens(process.env.BOARD_TOKENS),
  allowedEmails: loadAllowedEmails(process.env.ALLOWED_EMAILS),
  allowedEmailDomains: loadAllowedEmailDomains(process.env.ALLOWED_EMAIL_DOMAINS),
  tokenVerifier,
};

const app = buildApp({
  repository,
  auth,
  corsOrigins: loadCorsOrigins(process.env.CORS_ORIGIN),
});
const port = Number(process.env.PORT ?? 8787);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => console.log(`HANDOFF API listening on ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

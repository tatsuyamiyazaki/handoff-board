import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildApp } from './app.js';
import { loadBoardTokens } from './config.js';
import { FirestoreTaskRepository } from './repository/firestore-task-repository.js';
import { InMemoryTaskRepository } from './repository/in-memory-task-repository.js';
import type { TaskRepository } from './repository/task-repository.js';
import { devSeed } from './dev-seed.js';

const auth = { boardTokens: loadBoardTokens(process.env.BOARD_TOKENS) };

// Firestore（エミュレータ or 本番）に繋がる構成なら Firestore、無ければ in-memory + シード。
// Java/firebase CLI 未導入のローカルでも API を起動できるようにするためのフォールバック。
function createRepository(): TaskRepository {
  const useFirestore =
    process.env.FIRESTORE_EMULATOR_HOST || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (useFirestore) {
    initializeApp({
      credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : undefined,
      projectId: process.env.GCLOUD_PROJECT,
    });
    return new FirestoreTaskRepository(getFirestore());
  }
  return new InMemoryTaskRepository(devSeed);
}

const app = buildApp({ repository: createRepository(), auth });
const port = Number(process.env.PORT ?? 8787);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => console.log(`HANDOFF API listening on ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

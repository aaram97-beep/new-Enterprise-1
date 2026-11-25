import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signOut,
  updatePassword,
  type Auth,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore against the provisioned Enterprise databaseId
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export { firebaseConfig };

export const INTERNAL_EMAIL_DOMAIN = 'company.internal';

export function isValidInternalUsername(username: string): boolean {
  const trimmed = username.trim().toLowerCase();
  return /^[a-z0-9._-]{2,64}$/.test(trimmed);
}

export function usernameToInternalEmail(username: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${normalized || 'user'}@${INTERNAL_EMAIL_DOMAIN}`;
}

let provisionerAuthInstance: Auth | null = null;

function getProvisionerAuth(): Auth {
  if (provisionerAuthInstance) return provisionerAuthInstance;
  const existing = getApps().find((a) => a.name === 'employee-provisioner');
  const secondaryApp: FirebaseApp =
    existing || initializeApp(firebaseConfig, 'employee-provisioner');
  provisionerAuthInstance = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence,
  });
  return provisionerAuthInstance;
}

/**
 * Creates a Firebase Authentication Email/Password account for an employee
 * using a secondary in-memory Auth instance so the active admin session stays signed in.
 */
export async function createEmployeeAuthUser(
  username: string,
  password: string
): Promise<string> {
  const secondaryAuth = getProvisionerAuth();
  const email = usernameToInternalEmail(username);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const createdUid = cred.user.uid;
  try {
    await signOut(secondaryAuth);
  } catch {
    // Ignore secondary cleanup signOut error
  }
  return createdUid;
}

export function extractFirebaseAuthCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  const match = msg.match(/auth\/[a-z0-9-]+/i);
  return match ? match[0].toLowerCase() : '';
}

export function mapAuthError(error: unknown): { code: string; message: string } {
  const code = extractFirebaseAuthCode(error);
  switch (code) {
    case 'auth/operation-not-allowed':
      return {
        code,
        message:
          'Email/Password sign-in is not enabled in Firebase Authentication yet. Enable it in Firebase Console -> Authentication -> Sign-in method.',
      };
    case 'auth/weak-password':
      return {
        code,
        message: 'Password must be at least 6 characters for Firebase Authentication.',
      };
    case 'auth/email-already-in-use':
      return {
        code,
        message: 'A Firebase account already exists for this username.',
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        code,
        message: 'Invalid credentials or inactive account',
      };
    case 'auth/too-many-requests':
      return {
        code,
        message: 'Too many failed login attempts. Please wait a moment and try again.',
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: 'Network error connecting to Firebase Authentication.',
      };
    default:
      return {
        code,
        message: error instanceof Error ? error.message : 'Authentication failed',
      };
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function updateCurrentUserPassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No authenticated user session');
  }
  await updatePassword(auth.currentUser, newPassword);
}

export async function testConnection(): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await getDocFromServer(doc(firestoreDb, 'users', auth.currentUser.uid));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

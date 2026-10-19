export type AuthMode = 'signup' | 'login';
export type Credentials = { email: string; password: string };
export type FieldErrors = Partial<Record<keyof Credentials, string>>;
export type PublicUser = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPublicUser(value: unknown): value is PublicUser {
  return isRecord(value) &&
    ['id', 'email', 'createdAt', 'updatedAt'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0,
    );
}

// Explicitly select public fields: never forward unexpected secrets.
export function publicUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

export function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (Array.isArray(body.message)) {
    const messages = body.message.filter((item): item is string => typeof item === 'string');
    if (messages.length) return messages.join('；');
  }
  return fallback;
}

import isEmail from 'validator/lib/isEmail.js';
import type { AuthMode, Credentials, FieldErrors } from './auth-contract';

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCredentials(mode: AuthMode, input: Credentials): FieldErrors {
  const errors: FieldErrors = {};
  const email = normalizeEmail(input.email);
  const length = Array.from(input.password).length;
  if (!email) errors.email = '请输入电子邮箱';
  else if (Array.from(email).length > 254) errors.email = '邮箱不能超过 254 个字符';
  else if (!isEmail(email)) errors.email = '请输入有效的电子邮箱';

  if (length === 0) errors.password = '请输入密码';
  else if (length > 128) errors.password = '密码不能超过 128 个字符';
  else if (mode === 'signup' && !/\S/u.test(input.password)) errors.password = '密码不能全部为空白';
  else if (mode === 'signup' && length < 15) errors.password = '注册密码至少需要 15 个字符';
  return errors;
}

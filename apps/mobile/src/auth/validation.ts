import {
  codeSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  usernameSchema,
} from '@ongod/shared';
import { mn } from '../i18n/mn';

/**
 * Field checks for the forms. They use the same zod schemas as the API, so the app and the
 * server agree on what is valid; the texts are Mongolian (zod's own messages are English).
 * Each check returns an error text, or undefined when the value is fine.
 */
export type Check = (value: string) => string | undefined;

export const required: Check = (value) => (value.trim() === '' ? mn.errors.required : undefined);

const schemaCheck =
  (schema: { safeParse: (value: unknown) => { success: boolean } }, message: string): Check =>
  (value) => {
    if (value.trim() === '') return mn.errors.required;
    return schema.safeParse(value).success ? undefined : message;
  };

export const checks = {
  name: schemaCheck(nameSchema, mn.errors.required),
  email: schemaCheck(emailSchema, mn.errors.email),
  phone: schemaCheck(phoneSchema, mn.errors.phone),
  password: schemaCheck(passwordSchema, mn.errors.password),
  code: schemaCheck(codeSchema, mn.errors.code),
  username: schemaCheck(usernameSchema, mn.errors.username),
  /** Optional username (registration): empty is fine. */
  optionalUsername: ((value) =>
    value.trim() === '' || usernameSchema.safeParse(value).success
      ? undefined
      : mn.errors.username) as Check,
  /** The login password only has to be present; the server decides if it is right. */
  loginPassword: required,
  identifier: required,
};

/** Runs checks over a form; returns the errors by field (empty object = valid). */
export function validate<K extends string>(
  values: Record<K, string>,
  rules: Record<K, Check>,
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const key of Object.keys(rules) as K[]) {
    const message = rules[key](values[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

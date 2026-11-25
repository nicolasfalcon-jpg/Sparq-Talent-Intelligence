import { z } from "zod";

/** Sign-in form. Deliberately loose on the email format: the Auth server is the judge, and a malformed value must not read differently from a wrong one. */
export const SignInInput = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
  next: z.string().max(512).optional(),
}).strict();
export type SignInInput = z.infer<typeof SignInInput>;

export const SIGN_IN_ERROR = "Email or password is incorrect.";
export const SIGN_IN_MISSING = "Enter your email and password.";
export const NO_ROLE_ERROR = "This account has no access to the demonstration. Ask an administrator.";
export type SignInState = { error: string | null };

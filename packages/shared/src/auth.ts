import { z } from 'zod';

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.input<typeof loginInputSchema>;

/** Whether this deployment requires signing in, and whether this browser has. */
export const sessionSchema = z.object({
  authRequired: z.boolean(),
  authenticated: z.boolean(),
  username: z.string().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

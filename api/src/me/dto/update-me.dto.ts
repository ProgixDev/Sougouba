import { z } from 'zod';

/**
 * `avatarUrl` is a plain string, not a file upload — the mobile app uploads
 * directly to Supabase Storage's `avatars` bucket (RLS-gated to the caller's
 * own folder, see `drizzle/0006_avatars_bucket_and_policies.sql`) using its
 * own Supabase session, then hands this endpoint the resulting URL to
 * persist. NestJS never sees the file bytes — the same division of labour
 * as auth itself (Supabase does the primitive, this API records the result).
 */
export const updateMeSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis').optional(),
  avatarUrl: z.string().url().optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

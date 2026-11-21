import { z } from 'zod';

/**
 * `avatarUrl` is a Storage path, not a file upload: the app uploads through
 * the one-shot URL `POST /me/avatar-upload` signs, then sends the returned
 * `avatars/<userId>/<file>` path here. `MeService` checks it is in the
 * caller's own folder. `''` removes the photo. NestJS never sees the bytes.
 *
 * A path rather than a full URL, like product and shop photos: an absolute
 * URL pins the image to today's project hostname.
 */
export const updateMeSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis').optional(),
  avatarUrl: z.string().trim().max(300).optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

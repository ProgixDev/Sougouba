import { z } from 'zod';

/** One message from the shopper. Capped: a support question is a few lines, and every character is paid for twice. */
export const sendSupportMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message vide')
    .max(1000, 'Message trop long (1000 caractères au plus)'),
});

export type SendSupportMessageInput = z.infer<typeof sendSupportMessageSchema>;

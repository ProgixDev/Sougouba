import { z } from 'zod';

export const claimReferralSchema = z.object({
  code: z.string().trim().min(1, 'Code requis'),
});

export type ClaimReferralInput = z.infer<typeof claimReferralSchema>;

import { z } from 'zod';

export const votePostSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export type VotePostInput = z.infer<typeof votePostSchema>;

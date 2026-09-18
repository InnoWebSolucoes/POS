import { z } from 'zod';

/** DELETE /api/uploads - the URL previously returned by an upload route. */
export const deleteSchema = z.object({
  url: z.string().trim().min(1, 'URL obrigatorio.').max(2048, 'URL demasiado longo.'),
});

export type DeleteInput = z.infer<typeof deleteSchema>;

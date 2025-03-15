import z from 'zod';

export const fetchDataSchema = z.object({
  url: z.string().url(),
  timeout: z.number().optional(),
});

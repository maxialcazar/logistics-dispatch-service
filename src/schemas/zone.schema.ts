import { z } from "zod";

export const createZoneSchema = z.object({
  body: z.object({
    name: z.string().min(2),
  }),
});

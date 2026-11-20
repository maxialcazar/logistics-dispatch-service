import { z } from "zod";

export const updateCompanySchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Company name must be at least 2 characters")
        .max(100, "Company name must be at most 100 characters")
        .optional(),
      slug: z
        .string()
        .trim()
        .min(2, "Company slug must be at least 2 characters")
        .max(60, "Company slug must be at most 60 characters")
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          "Company slug must be lowercase alphanumeric with hyphens"
        )
        .optional(),
    })
    .refine((body) => body.name !== undefined || body.slug !== undefined, {
      message: "At least one updatable field (name or slug) must be provided",
    }),
});

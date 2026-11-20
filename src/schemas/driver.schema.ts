import { z } from "zod";

export const createDriverSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    username: z.string().min(3),
    password: z.string().min(6),
  }),
});

export const assignZonesSchema = z.object({
  params: z.object({
    driverId: z.string().uuid(),
  }),
  body: z.object({
    zoneIds: z.array(z.string().uuid()),
  }),
});
export const updateLocationSchema = z.object({
  body: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export const getDriverZonesSchema = z.object({
  params: z.object({
    driverId: z.string().uuid(),
  }),
});

export const getDriverByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const updateDriverSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      username: z.string().trim().min(3).max(60).optional(),
      password: z.string().min(6).max(128).optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
    })
    .refine((body) => Object.values(body).some((val) => val !== undefined), {
      message: "At least one updatable field must be provided",
    }),
});

export const deleteDriverSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

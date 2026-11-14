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

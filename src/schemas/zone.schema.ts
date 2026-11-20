import { z } from "zod";

// A coordinate pair: [longitude, latitude]
const coordSchema = z.tuple([z.number(), z.number()]);

const zoneIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createZoneSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    // GeoJSON ring: array of [lng, lat] pairs (minimum 3 to form a polygon)
    polygon: z.array(coordSchema).min(3).optional(),
  }),
});

export const getZoneByIdSchema = z.object({
  params: zoneIdParamsSchema,
});

export const updateZoneSchema = z.object({
  params: zoneIdParamsSchema,
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    driverId: z.string().uuid().nullable().optional(),
    // null to clear the polygon, array to set it
    polygon: z.array(coordSchema).min(3).nullable().optional(),
  }),
});

export const deleteZoneSchema = z.object({
  params: zoneIdParamsSchema,
});

export const bulkZoneStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean(),
  }),
});

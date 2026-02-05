import { z } from "zod";

export const createPackageSchema = z.object({
  body: z.object({
    trackingCode: z.string().min(5),
    zoneId: z.string().uuid(),
  }),
});

export const updatePackageStatusSchema = z.object({
  params: z.object({
    packageId: z.string().uuid(),
  }),
  body: z.object({
    status: z.enum(["pending", "assigned", "in_transit", "delivered", "cancelled"]),
  }),
});

export const assignPackageSchema = z.object({
  params: z.object({
    packageId: z.string().uuid(),
  }),
  body: z.object({
    driverId: z.string().uuid(),
  }),
});

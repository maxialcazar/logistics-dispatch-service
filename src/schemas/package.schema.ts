import { z } from "zod";

export const createPackageSchema = z.object({
  body: z.object({
    trackingCode: z.string().min(5),
    
    // Recipient Info
    recipientName: z.string().min(2),
    recipientAddress: z.string().min(5),
    recipientPhone: z.string().min(3),
    recipientEmail: z.string().email().optional(),
    
    // Delivery Details
    addressReferences: z.string().optional(),
    addressStreet: z.string().optional(),
    addressNumber: z.string().optional(),
    addressCity: z.string().optional(),
    addressCountry: z.string().optional(),

    // Sender Info (Optional)
    senderName: z.string().optional().or(z.literal("")),
    senderAddress: z.string().optional().or(z.literal("")),
    senderPhone: z.string().optional().or(z.literal("")),

    // Logistics
    weight: z.number().optional().nullable(),
    volume: z.number().optional().nullable(),
    zoneId: z.string().uuid().optional(), // Make optional if auto-zone logic exists? No, keep required for now as per controller logic.
    
    // Coordinates
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    estimatedDeliveryAt: z.string().datetime().optional(),
  }),
});

export const updatePackageStatusSchema = z.object({
  params: z.object({
    packageId: z.string().uuid(),
  }),
  body: z.object({
    status: z.enum(["pending", "assigned", "in_transit", "delivered", "cancelled"]),
    lat: z.number().optional(),
    lng: z.number().optional(),
    estimatedDeliveryAt: z.string().datetime().optional(),
    // Proof of Delivery (POD) - only relevant when status is 'delivered'
    signature: z.string().optional(), // Base64 data URI of the recipient's signature
    photo: z.string().optional(),     // Base64 data URI of the delivery photo evidence
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

export const getPackagesByDriverSchema = z.object({
  params: z.object({
    driverId: z.string().uuid(),
  }),
});

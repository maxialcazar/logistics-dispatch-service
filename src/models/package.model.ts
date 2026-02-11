export type PackageStatus =
  | "pending"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "cancelled";

export interface Package {
  id: string;
  trackingCode: string;
  zoneId: string;
  driverId?: string;
  status: PackageStatus;
}

import { Response } from "express";
import { PackageService } from "../services/package.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PackageStatus } from "@prisma/client";
import logger from "../utils/logger";
import { sanitizePagination } from "../utils/pagination";

function normalizeOptionalQueryString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function handlePackageDateError(res: Response, error: any): boolean {
  if (error?.message === "invalid_date_filter" || error?.message === "invalid_date_range") {
    res.status(400).json({
      error:
        error.message === "invalid_date_range"
          ? "dateFrom must be earlier than or equal to dateTo"
          : "Invalid date filter",
    });
    return true;
  }
  return false;
}

export async function getPackages(req: AuthRequest, res: Response) {
  try {
    const { search, status, zoneId, driverId, trackingCode, dateFrom, dateTo, isArchived } = req.query;
    const { page, limit } = sanitizePagination(req.query);

    const result = await PackageService.getAllPackages(req.user!.companyId, {
      search: normalizeOptionalQueryString(search),
      status: normalizeOptionalQueryString(status) as PackageStatus | string | undefined,
      zoneId: normalizeOptionalQueryString(zoneId),
      driverId: normalizeOptionalQueryString(driverId),
      trackingCode: normalizeOptionalQueryString(trackingCode),
      dateFrom: normalizeOptionalQueryString(dateFrom),
      dateTo: normalizeOptionalQueryString(dateTo),
      page,
      limit,
      isArchived: normalizeOptionalQueryString(isArchived) === "true",
    });
    res.json(result);
  } catch (error: any) {
    if (handlePackageDateError(res, error)) return;
    logger.error("Error in getPackages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createPackage(req: AuthRequest, res: Response) {
  const {
    trackingCode,
    recipientName,
    recipientAddress,
    recipientPhone,
    recipientEmail,
    addressStreet,
    addressNumber,
    addressFloor,
    addressCity,
    addressZip,
    addressCountry,
    addressReferences,
    senderName,
    senderAddress,
    senderPhone,
    weight,
    volume,
    zoneId,
    lat,
    lng,
    estimatedDeliveryAt,
    deliveryWindowStart,
    deliveryWindowEnd,
  } = req.body;

  try {
    const pkg = await PackageService.createPackage(req.user!.companyId, {
      trackingCode,
      recipientName,
      recipientAddress,
      recipientPhone,
      recipientEmail,
      addressStreet,
      addressNumber,
      addressFloor,
      addressCity,
      addressZip,
      addressCountry,
      addressReferences,
      senderName,
      senderAddress,
      senderPhone,
      weight,
      volume,
      zoneId,
      userId: req.user!.id,
      lat,
      lng,
      estimatedDeliveryAt: parseOptionalNullableDate(estimatedDeliveryAt),
      deliveryWindowStart: parseOptionalNullableDate(deliveryWindowStart),
      deliveryWindowEnd: parseOptionalNullableDate(deliveryWindowEnd),
    });
    res.status(201).json(pkg);
  } catch (error: any) {
    console.error(error);
    if (error.message === "zone_not_found") {
      return res.status(400).json({ error: "zone not found" });
    }
    if (error?.message === "invalid_delivery_window" || error?.message === "invalid_date_filter") {
      return res.status(400).json({
        error:
          error.message === "invalid_date_filter"
            ? "Invalid date filter"
            : "deliveryWindowStart must be earlier than or equal to deliveryWindowEnd",
      });
    }
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}

export async function getPackagesByDriver(req: AuthRequest, res: Response) {
  const driverId = req.params.driverId as string;
  try {
    const packages = await PackageService.getPackagesByDriver(req.user!.companyId, driverId);
    res.json(packages);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updatePackageStatus(req: AuthRequest, res: Response) {
  const { packageId } = req.params;
  const { status, lat, lng, estimatedDeliveryAt, signature, photo, notes, reason, deliveryNotes } =
    req.body;

  try {
    const updated = await PackageService.updateStatus(req.user!.companyId, {
      packageId: packageId as string,
      status,
      userId: req.user!.id,
      userRole: req.user!.role,
      userDriverId: req.user!.driverId || null,
      lat,
      lng,
      estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt) : undefined,
      signature,
      photo,
      notes,
      reason,
      deliveryNotes,
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
      
    }
    if (error?.message === "not_authorized_for_zone") {
      return res.status(403).json({ error: "not authorized for this zone" });
    }
    if (typeof error?.message === "string" && error.message.startsWith("invalid_transition")) {
      const [, from, to] = error.message.split(":");
      return res.status(422).json({
        error: "invalid status transition",
        from,
        to,
      });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function assignPackageToDriver(req: AuthRequest, res: Response) {
  const { driverId } = req.body;
  const packageId = req.params.packageId as string;

  try {
    const updated = await PackageService.assignToDriver(req.user!.companyId, packageId, driverId, req.user!.id);
    res.json(updated);
  } catch (error: any) {
    if (error?.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
    }
    if (error?.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    if (error?.message === "driver_not_in_zone") {
      return res.status(400).json({ error: "driver is not assigned to this package's zone" });
    }
    if (typeof error?.message === "string" && error.message.startsWith("invalid_transition")) {
      const [, from, to] = error.message.split(":");
      return res.status(422).json({
        error: "invalid status transition",
        from,
        to,
      });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getMyPackages(req: AuthRequest, res: Response) {
  if (!req.user?.driverId) {
    return res.status(403).json({ error: "not a driver" });
  }

  try {
    const packages = await PackageService.getMyPackages(req.user.companyId, req.user.driverId);
    res.json(packages);
  } catch (error: any) {
    if (error.message === "driver_not_found") {
      return res.status(404).json({ error: "driver not found" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getPackageHistory(req: AuthRequest, res: Response) {
  const packageId = req.params.packageId as string;
  try {
    const history = await PackageService.getPackageHistory(
      req.user!.companyId,
      packageId,
      {
        userRole: req.user!.role,
        userDriverId: req.user!.driverId || null,
      }
    );
    res.json(history);
  } catch (error: any) {
    if (error?.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
    }
    if (error?.message === "not_authorized_for_zone") {
      return res.status(403).json({ error: "not authorized for this zone" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getDashboardStats(req: AuthRequest, res: Response) {
  try {
    const { dateFrom, dateTo } = req.query;
    const stats = await PackageService.getDashboardStats(req.user!.companyId, {
      dateFrom: normalizeOptionalQueryString(dateFrom),
      dateTo: normalizeOptionalQueryString(dateTo),
    });
    res.json(stats);
  } catch (error) {
    if (handlePackageDateError(res, error)) return;
    logger.error("Stats Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

function parseOptionalNullableDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(String(value));
}

export async function getPackageById(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const pkg = await PackageService.getPackageById(req.user!.companyId, id, {
      userRole: req.user!.role,
      userDriverId: req.user!.driverId || null,
    });
    res.json(pkg);
  } catch (error: any) {
    if (error?.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
    }
    if (error?.message === "not_authorized_for_zone") {
      return res.status(403).json({ error: "not authorized for this zone" });
    }
    logger.error("Error in getPackageById:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updatePackage(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const {
    recipientName,
    recipientAddress,
    recipientPhone,
    recipientEmail,
    addressStreet,
    addressNumber,
    addressFloor,
    addressCity,
    addressZip,
    addressReferences,
    senderName,
    senderAddress,
    senderPhone,
    weight,
    volume,
    zoneId,
    lat,
    lng,
    estimatedDeliveryAt,
    deliveryWindowStart,
    deliveryWindowEnd,
  } = req.body;

  try {
    const updated = await PackageService.updatePackage(
      req.user!.companyId,
      id,
      req.user!.id,
      {
        recipientName,
        recipientAddress,
        recipientPhone,
        recipientEmail,
        addressStreet,
        addressNumber,
        addressFloor,
        addressCity,
        addressZip,
        addressReferences,
        senderName,
        senderAddress,
        senderPhone,
        weight,
        volume,
        zoneId,
        lat,
        lng,
        estimatedDeliveryAt: parseOptionalNullableDate(estimatedDeliveryAt),
        deliveryWindowStart: parseOptionalNullableDate(deliveryWindowStart),
        deliveryWindowEnd: parseOptionalNullableDate(deliveryWindowEnd),
      }
    );
    res.json(updated);
  } catch (error: any) {
    if (error?.message === "package_not_found") {
      return res.status(404).json({ error: "package not found" });
    }
    if (error?.message === "zone_not_found") {
      return res.status(400).json({ error: "zone not found" });
    }
    if (error?.message === "invalid_delivery_window" || error?.message === "invalid_date_filter") {
      return res.status(400).json({
        error: "deliveryWindowStart must be earlier than or equal to deliveryWindowEnd",
      });
    }
    if (
      typeof error?.message === "string" &&
      error.message.startsWith("cannot_update_terminal_package:")
    ) {
      const [, status] = error.message.split(":");
      return res.status(422).json({
        error: "Cannot update a package that is already delivered or cancelled",
        status,
      });
    }
    if (error?.message === "cannot_reassign_zone_in_transit") {
      return res.status(422).json({
        error: "Cannot reassign zone while package is in_transit",
      });
    }
    logger.error("Error in updatePackage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function archivePackages(req: AuthRequest, res: Response) {
    const { packageIds } = req.body;
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
        return res.status(400).json({ error: "Invalid packageIds" });
    }
    try {
        const result = await PackageService.archivePackages(req.user!.companyId, packageIds);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export async function unarchivePackages(req: AuthRequest, res: Response) {
    const { packageIds } = req.body;
    try {
        const result = await PackageService.unarchivePackages(req.user!.companyId, packageIds);
        res.json({ count: result.count });
    } catch (error) {
        logger.error("Error in unarchivePackages:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export async function deletePackages(req: AuthRequest, res: Response) {
    const { packageIds } = req.body;
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
        return res.status(400).json({ error: "Invalid packageIds" });
    }
    try {
        const result = await PackageService.deletePackages(req.user!.companyId, packageIds);
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
}
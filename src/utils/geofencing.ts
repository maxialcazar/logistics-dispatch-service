import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Coordinate pair: [longitude, latitude]
 * Following GeoJSON convention (lng first, lat second).
 */
type Coord = [number, number];

/**
 * Ray-casting algorithm — determines whether a point (lat, lng) lies
 * inside a polygon defined as an ordered array of [lng, lat] pairs.
 *
 * The polygon does NOT need to be explicitly closed (first === last),
 * the algorithm handles open rings correctly.
 *
 * @returns true if the point is inside the polygon
 */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Coord[]
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i]; // xi = lng, yi = lat
    const [xj, yj] = polygon[j];

    // Ray cast from (lng, lat) horizontally to the right
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Finds the first active zone for a company whose polygon contains
 * the given coordinates. Returns null if no zone matches.
 *
 * Only zones that have a polygon defined are evaluated.
 */
export async function detectZone(
  companyId: string,
  lat: number,
  lng: number
): Promise<{ id: string; name: string } | null> {
  // Fetch all zones that have a polygon set
  const zones = await prisma.zone.findMany({
    where: {
      companyId,
      polygon: { not: Prisma.DbNull },
    },
    select: {
      id: true,
      name: true,
      polygon: true,
    },
  });

  for (const zone of zones) {
    if (!zone.polygon) continue;

    // polygon is stored as JSON; cast carefully
    const poly = zone.polygon as Coord[];
    if (!Array.isArray(poly) || poly.length < 3) continue;

    if (pointInPolygon(lat, lng, poly)) {
      return { id: zone.id, name: zone.name };
    }
  }

  return null;
}

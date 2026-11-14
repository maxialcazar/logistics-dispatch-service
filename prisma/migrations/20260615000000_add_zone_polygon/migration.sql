-- AddColumn: polygon to Zone table
-- This migration adds a nullable JSONB column to store GeoJSON polygon rings.
-- It is non-breaking: existing rows remain unaffected (column defaults to NULL).

ALTER TABLE "Zone" ADD COLUMN "polygon" JSONB;

import axios from 'axios';

const GEOCODE_TIMEOUT_MS = 5000;

interface GeoResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  // 1. First attempt: OpenStreetMap Nominatim (Free, no key)
  try {
    const url = `https://nominatim.openstreetmap.org/search`;
    const response = await axios.get(url, {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'LogisticsDispatchService/1.0'
      },
      timeout: GEOCODE_TIMEOUT_MS
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    }
  } catch (error) {
    console.warn("⚠️ OpenStreetMap Nominatim geocoding failed, trying fallbacks:", error);
  }

  // 2. Second attempt (Fallback): Google Maps Geocoding
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json`;
      const response = await axios.get(url, {
        params: {
          address,
          key: googleKey
        },
        timeout: GEOCODE_TIMEOUT_MS
      });

      if (response.data && response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          lat: parseFloat(location.lat),
          lng: parseFloat(location.lng)
        };
      } else {
        console.warn("Google Maps Geocoding API returned status:", response.data?.status);
      }
    } catch (error) {
      console.warn("⚠️ Google Maps geocoding failed, trying next fallback:", error);
    }
  }

  // 3. Third attempt (Fallback): Mapbox Geocoding
  const mapboxKey = process.env.MAPBOX_API_KEY;
  if (mapboxKey) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
      const response = await axios.get(url, {
        params: {
          access_token: mapboxKey,
          limit: 1
        },
        timeout: GEOCODE_TIMEOUT_MS
      });

      if (response.data && response.data.features && response.data.features.length > 0) {
        const center = response.data.features[0].center; // Mapbox returns center as [longitude, latitude]
        return {
          lat: parseFloat(center[1]),
          lng: parseFloat(center[0])
        };
      }
    } catch (error) {
      console.warn("⚠️ Mapbox geocoding failed:", error);
    }
  }

  return null; // All attempts failed
}


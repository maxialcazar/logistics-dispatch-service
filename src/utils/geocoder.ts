import axios from 'axios';

interface GeoResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    // Using OpenStreetMap Nominatim API (Free, requires User-Agent)
    const url = `https://nominatim.openstreetmap.org/search`;
    
    const response = await axios.get(url, {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'LogisticsDispatchService/1.0' // Required by Nominatim policy
      }
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
    }

    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null; // Fail gracefully
  }
}

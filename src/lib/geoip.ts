import * as maxmind from "maxmind";
import path from "path";

let cityLookup: maxmind.Reader<maxmind.CityResponse> | null = null;

export async function initGeoIP() {
  if (!cityLookup) {
    // 설치된 DB 경로 지정
    const dbPath = path.join(
      "C:",
      "ProgramData",
      "MaxMind",
      "GeoIPUpdate",
      "GeoIP",
      "GeoLite2-City.mmdb"
    );
    cityLookup = await maxmind.open<maxmind.CityResponse>(dbPath);
  }
}

export function getGeoLocation(ip: string): string | null {
  if (!cityLookup) return null;
  const geo = cityLookup.get(ip);
  if (!geo) return null;

  const city = geo.city?.names?.en ?? "";
  const region = geo.subdivisions?.[0]?.names?.en ?? "";
  const country = geo.country?.names?.en ?? "";

  return [city, region, country].filter(Boolean).join(", ") || null;
}

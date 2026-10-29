// Open-Meteo's forecast, reduced to what the home screen needs. No React Native
// imports here, so it runs under plain Node for checks.

export type Sky = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Hour {
  t: number; // epoch ms
  tempC: number;
  feelsC: number;
  rainP: number; // 0–100
  sky: Sky;
  windKmh: number;
  isDay: boolean;
}

export interface Weather {
  fetchedAt: number;
  tempC: number;
  feelsC: number;
  windKmh: number;
  sky: Sky;
  isDay: boolean;
  sunrise: number | null; // today, epoch ms
  sunset: number | null;
  nextSunrise: number | null; // tomorrow
  hours: Hour[]; // from this hour onwards
}

export function skyFor(code: number): Sky {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

export function parse(j: any): Weather {
  const c = j.current;
  const h = j.hourly;
  const now = Date.now();
  const hours: Hour[] = (h.time as number[])
    .map((t, i) => ({
      t: t * 1000,
      tempC: h.temperature_2m[i],
      feelsC: h.apparent_temperature[i],
      rainP: h.precipitation_probability[i] ?? 0,
      sky: skyFor(h.weather_code[i]),
      windKmh: h.wind_speed_10m[i],
      isDay: h.is_day[i] === 1,
    }))
    .filter((x) => x.t >= now - 3600 * 1000);
  const ms = (v: number | undefined) => (v ? v * 1000 : null);
  return {
    fetchedAt: now,
    tempC: c.temperature_2m,
    feelsC: c.apparent_temperature,
    windKmh: c.wind_speed_10m,
    sky: skyFor(c.weather_code),
    isDay: c.is_day === 1,
    sunrise: ms(j.daily?.sunrise?.[0]),
    sunset: ms(j.daily?.sunset?.[0]),
    nextSunrise: ms(j.daily?.sunrise?.[1]),
    hours,
  };
}


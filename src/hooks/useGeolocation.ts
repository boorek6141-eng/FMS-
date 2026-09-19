import { useState, useEffect, useCallback, useRef } from 'react';

export interface GpsPosition {
  lat: number; lng: number; accuracy: number;
  speed: number | null; heading: number | null; timestamp: number;
}

interface GeoState {
  position: GpsPosition | null;
  error: string | null;
  tracking: boolean;
  trail: [number, number][];
}

class PositionSmoother {
  private buf: GpsPosition[] = [];
  private readonly size = 5;
  push(p: GpsPosition): GpsPosition {
    this.buf.push(p);
    if (this.buf.length > this.size) this.buf.shift();
    const n = this.buf.length;
    return {
      lat: this.buf.reduce((a, x) => a + x.lat, 0) / n,
      lng: this.buf.reduce((a, x) => a + x.lng, 0) / n,
      accuracy: Math.min(...this.buf.map(x => x.accuracy)),
      speed: p.speed, heading: p.heading, timestamp: p.timestamp,
    };
  }
  reset() { this.buf = []; }
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ position: null, error: null, tracking: false, trail: [] });
  const watchId = useRef<number | null>(null);
  const trailRef = useRef<[number, number][]>([]);
  const smoother = useRef(new PositionSmoother());
  const lastSave = useRef(0);

  const onSuccess = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy, speed, heading } = pos.coords;
    if (accuracy > 50) return;
    const raw: GpsPosition = { lat: latitude, lng: longitude, accuracy, speed: speed ?? null, heading: heading ?? null, timestamp: pos.timestamp };
    const smoothed = smoother.current.push(raw);
    const now = Date.now();
    const last = trailRef.current[trailRef.current.length - 1];
    const dist = last ? Math.hypot((smoothed.lat - last[0]) * 111320, (smoothed.lng - last[1]) * 111320 * Math.cos(smoothed.lat * Math.PI / 180)) : Infinity;
    if (!last || now - lastSave.current > 3000 || dist > 5) {
      trailRef.current.push([smoothed.lat, smoothed.lng]);
      lastSave.current = now;
    }
    setState(s => ({ ...s, position: smoothed, error: null }));
  }, []);

  const onError = useCallback((err: GeolocationPositionError) => {
    const msgs: Record<number, string> = { 1: 'Brak uprawnień — włącz lokalizację', 2: 'Brak sygnału GPS', 3: 'Czas minął' };
    setState(s => ({ ...s, error: msgs[err.code] || 'Błąd GPS' }));
  }, []);

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) { setState(s => ({ ...s, error: 'Geolokacja nieobsługiwana' })); return; }
    smoother.current.reset(); trailRef.current = []; lastSave.current = 0;
    setState(s => ({ ...s, tracking: true, trail: [], error: null }));
    watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 });
  }, [onSuccess, onError]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    setState(s => ({ ...s, tracking: false, trail: [...trailRef.current] }));
  }, []);

  const clearTrail = useCallback(() => { trailRef.current = []; setState(s => ({ ...s, trail: [] })); }, []);

  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);

  return { ...state, startTracking, stopTracking, clearTrail, isSupported: 'geolocation' in navigator };
}

/** Expo Router search parameters may be absent or repeated in a URL. */
export function routeParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

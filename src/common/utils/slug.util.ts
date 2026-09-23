export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function generateSlug(base: string): string {
  const slug = slugify(base) || 'item';
  return `${slug}-${randomSlugSuffix()}`;
}

const customSlugPattern = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

export function isValidCustomSlug(slug: string) {
  return customSlugPattern.test(slug) && slug !== 'api'
}

export function isValidSlug(slug: string) {
  return isValidCustomSlug(slug) || /^[A-Za-z0-9_-]{12}$/.test(slug)
}

// The "for life" subscription: activated like any plan, for 100 years, and told
// apart by how far away its end date is. Only the first 20 clinics can buy it
// (MARKETING_CLAIMS.md §7), so /admin counts them.

export const LIFETIME_DAYS = 36500
export const LIFETIME_CAP = 20

export const isLifetime = (endsAt) => !!endsAt && new Date(endsAt).getTime() - Date.now() > 50 * 365 * 864e5

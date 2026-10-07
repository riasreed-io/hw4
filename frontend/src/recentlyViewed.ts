/**
 * A guest's browsing history, kept in their own browser.
 *
 * Signed-in shoppers get `product_views` in the database instead. A guest has
 * no account to attach browsing to, so building a server-side profile of them
 * would be collecting data we have no use for - this stays on their machine and
 * is sent up only as part of a message they chose to send.
 */

const KEY = 'cc_recent_views'
const OPT_OUT_KEY = 'cc_track_views'
const MAX = 12

/** Guests govern their own tracking from their own browser. */
export function guestTrackingOn(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== '0'
  } catch {
    return true
  }
}

export function setGuestTracking(on: boolean) {
  try {
    localStorage.setItem(OPT_OUT_KEY, on ? '1' : '0')
    // Switching it off throws away what is already stored. Stopping collection
    // but keeping the old list would not be an opt-out.
    if (!on) localStorage.removeItem(KEY)
  } catch {
    /* private browsing */
  }
}

export function getGuestViews(): string[] {
  if (!guestTrackingOn()) return []
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function addGuestView(productId: string) {
  if (!guestTrackingOn()) return
  try {
    // Re-opening a product moves it to the front rather than stacking up.
    const next = [productId, ...getGuestViews().filter((id) => id !== productId)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private browsing, storage full - not worth failing a page render over */
  }
}

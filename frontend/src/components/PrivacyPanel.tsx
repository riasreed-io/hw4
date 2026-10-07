import { useEffect, useState } from 'react'
import { fetchPreferences, forgetMe, savePreferences, type Preferences } from '../api'
import { useAuth } from '../AuthContext'
import { guestTrackingOn, setGuestTracking } from '../recentlyViewed'

/**
 * What the shop remembers, and the switch to stop it.
 *
 * Signed in, these write to `user_preferences` and the server acts on them
 * immediately - switching something off deletes what we already hold, because
 * an opt-out that leaves the old rows in place is only a promise about the
 * future. Logged out, the same switch governs localStorage, which is the only
 * place a guest's browsing ever lives.
 */
export default function PrivacyPanel() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>({
    signed_in: false,
    track_views: true,
    store_chat: true,
  })
  const [guestTrack, setGuestTrack] = useState(guestTrackingOn())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchPreferences()
      .then(setPrefs)
      .catch(() => {})
    setGuestTrack(guestTrackingOn())
    setNote('')
  }, [user])

  async function toggle(key: 'track_views' | 'store_chat', value: boolean) {
    if (!user) {
      setGuestTracking(value)
      setGuestTrack(value)
      setNote(value ? 'Your browser will remember again.' : 'Cleared from your browser.')
      return
    }
    setBusy(true)
    try {
      setPrefs(await savePreferences({ [key]: value }))
      setNote(value ? 'Saved.' : 'Saved, and what we had was deleted.')
    } catch {
      setNote('Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  async function forget() {
    if (!user) {
      setGuestTracking(false)
      setGuestTracking(true)
      setNote('Cleared from your browser.')
      return
    }
    setBusy(true)
    try {
      const r = await forgetMe()
      setNote(`Deleted ${r.views_deleted} viewed products and ${r.messages_deleted} messages.`)
    } catch {
      setNote('Could not do that.')
    } finally {
      setBusy(false)
    }
  }

  const viewsOn = user ? prefs.track_views : guestTrack

  return (
    <div className="privacy">
      <b>What we remember</b>

      <label>
        <input
          type="checkbox"
          checked={viewsOn}
          disabled={busy}
          onChange={(e) => toggle('track_views', e.target.checked)}
        />
        Remember what I browse
      </label>

      {user && (
        <label>
          <input
            type="checkbox"
            checked={prefs.store_chat}
            disabled={busy}
            onChange={(e) => toggle('store_chat', e.target.checked)}
          />
          Save my chat history
        </label>
      )}

      <p className="privacy-note">
        {user
          ? 'Switching one off deletes what we already have. Nothing is shared outside this shop.'
          : "You are not signed in, so your browsing stays in this browser and never reaches us."}
      </p>

      <button className="privacy-forget" onClick={forget} disabled={busy}>
        Forget my activity
      </button>

      {note && <p className="privacy-said">{note}</p>}
    </div>
  )
}

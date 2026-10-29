import { useEffect, useMemo, useState } from 'react'
import { fetchNotedTopics } from './api'
import { LEARN } from '../content/learn'

// { topicKey: true } for every topic with notes — bundled sheets plus topics
// with rows in learn_notes. Shows the bundled ones straight away and adds the
// database ones once they load (kept for the session, so later screens don't
// flicker). If the request fails, only the bundled sheets count.
let cached = null

export function useNotedTopics() {
  const [dbKeys, setDbKeys] = useState(cached)
  useEffect(() => {
    let live = true
    fetchNotedTopics()
      .then((keys) => { cached = keys; if (live) setDbKeys(keys) })
      .catch(() => { /* bundled notes still work */ })
    return () => { live = false }
  }, [])
  return useMemo(() => {
    const noted = Object.fromEntries(Object.keys(LEARN).map((k) => [k, true]))
    for (const k of dbKeys || []) noted[k] = true
    return noted
  }, [dbKeys])
}

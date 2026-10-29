import React from 'react'
import { flushSync } from 'react-dom'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './supabaseClient'
import App from './App.jsx'
import './index.css'

const root = document.getElementById('root')

function start(initialSession) {
  // Committed synchronously, so the server's HTML is already replaced when
  // data-ssr (which hides it from signed-in users, see index.html) goes.
  flushSync(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App initialSession={initialSession} />
        <Analytics />
      </React.StrictMode>,
    )
  })
  root.removeAttribute('data-ssr')
}

// A public page rendered on the server (home, a coaching's page, the pitch to
// coachings) stays on screen until we know whether someone is logged in, then
// the app takes over. Everything else starts at the boot splash.
if (root.hasAttribute('data-ssr')) {
  supabase.auth.getSession().then(({ data }) => start(data.session), () => start(undefined))
} else {
  start(undefined)
}

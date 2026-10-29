import { supabase } from '../supabaseClient'
import { ApiError } from './api'

// Contact form (/contact) and its inbox under Admin → Messages
// (contact_messages; migration contact_messages).

export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'hello@example.com'

export const CONTACT_TOPICS = [
  { key: 'general', label: 'General question' },
  { key: 'student', label: 'Help with the app' },
  { key: 'coaching', label: 'For my coaching' },
  { key: 'bug', label: 'Something isn’t working' },
]

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Anyone can send; a logged-in sender's account is attached. Nothing is read
// back (a logged-out sender can't read the table).
export async function sendContactMessage({ name, email, phone, topic, message }, userId) {
  const { error } = await supabase.from('contact_messages').insert({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim() || null,
    topic,
    message: message.trim(),
    user_id: userId || null,
  })
  if (error) throw new ApiError(error, 'Could not send your message. Please try again.')
}

// Admins only. Newest first; unhandled ones first.
export async function fetchContactMessages() {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('*')
    .order('handled', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new ApiError(error)
  return data || []
}

export async function fetchOpenMessageCount() {
  const { count, error } = await supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('handled', false)
  return error ? 0 : count || 0
}

export async function setMessageHandled(id, handled) {
  const { error } = await supabase.from('contact_messages').update({ handled }).eq('id', id)
  if (error) throw new ApiError(error)
}

import { supabase } from '../supabaseClient'
import { isMissingSchema } from './api'

// Partner registration (/partner): one application per account, kept in
// partner_applications. Files go to the private 'partner-files' bucket.

// Fedge is registered in Rajasthan: a partner billed in the same state pays
// CGST + SGST, anyone else IGST.
export const FEDGE_STATE = 'Rajasthan'

export const BUSINESS_TYPES = [
  { key: 'proprietorship', label: 'Proprietorship' },
  { key: 'partnership', label: 'Partnership' },
  { key: 'llp', label: 'LLP' },
  { key: 'pvt_ltd', label: 'Private Limited' },
  { key: 'other', label: 'Other' },
]

export const PARTNER_PLANS = [
  { key: 'prelims', label: 'Prelims', price: '₹3,000' },
  { key: 'prelims_mains', label: 'Prelims + Mains', price: '₹5,000' },
]

export const PARTNER_EXAMS = [
  'SBI PO', 'SBI Clerk', 'IBPS PO', 'IBPS Clerk', 'IBPS RRB PO', 'IBPS RRB Clerk',
  'RBI Grade B', 'RBI Assistant', 'NABARD', 'SEBI Grade A', 'LIC AAO', 'Other',
]

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const MOBILE_RE = /^[6-9][0-9]{9}$/
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const PINCODE_RE = /^[1-9][0-9]{5}$/
export const ACCOUNT_RE = /^[0-9]{9,18}$/
export const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/

export class PartnerNotReady extends Error {}

function partnerError(error) {
  if (isMissingSchema(error)) return new PartnerNotReady('Partner registration isn’t open yet. Please try again later.')
  if (error.code === '23514') return new Error('A field is in the wrong format. Check the form and try again.')
  if (error.code === '23502') return new Error('A required field is empty.')
  if (error.code === '42501') return new Error('This application is already being processed, so it can’t be changed here. Contact Fedge to update it.')
  return new Error(error.message || 'Something went wrong. Please try again.')
}

// The caller's application, or null.
export async function fetchMyPartnerApplication(userId) {
  const { data, error } = await supabase.from('partner_applications').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw partnerError(error)
  return data
}

export async function savePartnerApplication(row, id = null) {
  const q = id
    ? supabase.from('partner_applications').update(row).eq('id', id)
    : supabase.from('partner_applications').insert(row)
  const { data, error } = await q.select('*').single()
  if (error) throw partnerError(error)
  return data
}

const FILE_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
}

// Uploads the file as-is (logos keep their quality) and returns its path in
// the private bucket.
export async function uploadPartnerFile(file, userId, kind) {
  const ext = FILE_TYPES[file?.type]
  if (!ext) throw new Error('Use a PNG, JPG, WebP, SVG or PDF file.')
  if (file.size > 5 * 1024 * 1024) throw new Error('The file is over 5 MB. Use a smaller one.')
  const path = `${userId}/${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('partner-files').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message || 'Upload failed.')
  return path
}

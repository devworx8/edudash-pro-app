import { assertSupabase } from '@/lib/supabase'

/**
 * Input for creating a checkout session
 */
export type CheckoutInput = {
  scope: 'school' | 'user'
  schoolId?: string
  userId?: string
  planTier: string
  billing: 'monthly' | 'annual'
  seats?: number
  return_url?: string
  cancel_url?: string
  email_address?: string
}

/**
 * Response from checkout creation
 */
export type CheckoutResponse = {
  redirect_url?: string
  error?: string
}

/**
 * Input for cancelling a subscription
 */
export type CancelSubscriptionInput = {
  scope: 'school' | 'user'
  schoolId?: string
  userId?: string
  reason?: string
}

/**
 * Response from cancellation
 */
export type CancelSubscriptionResponse = {
  success?: boolean
  cancelled_at?: string
  ends_at?: string
  error?: string
}

function extractCheckoutErrorMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  const anyErr = err as any
  const baseMessage = typeof anyErr?.message === 'string' ? anyErr.message : ''
  const contextBody = anyErr?.context?.body
  if (contextBody) {
    try {
      const parsed = typeof contextBody === 'string' ? JSON.parse(contextBody) : contextBody
      if (parsed && typeof parsed.error === 'string') return parsed.error
      if (typeof parsed === 'string') return parsed
    } catch {
      if (typeof contextBody === 'string') return contextBody
    }
  }
  return baseMessage
}

function toFriendlyCheckoutError(rawMessage: string): string {
  const msg = rawMessage || ''
  if (/school_id_required/i.test(msg)) {
    return 'We could not identify your school account. Please sign in again and retry.'
  }
  if (/user_id_required/i.test(msg)) return 'Please sign in again and retry your payment.'
  if (/plan_tier_required|invalid_scope|invalid_billing/i.test(msg)) {
    return 'Invalid checkout request. Please refresh and try again.'
  }
  if (/contact_sales_required/i.test(msg)) return 'This plan requires a sales contact. Please reach out to sales to continue.'
  if (/plan not found/i.test(msg)) return 'That plan isn’t available right now. Please refresh and try again.'
  if (/payfast.*not configured|passphrase required/i.test(msg)) {
    return 'Payments are temporarily unavailable. Please try again later.'
  }
  if (/invalid price/i.test(msg)) return 'That plan’s price is unavailable right now. Please refresh and try again.'
  if (/edge function returned.*no-?2xx|non-?2xx/i.test(msg)) {
    return 'We couldn’t start checkout right now. Please try again in a minute.'
  }
  if (/auth|jwt|token|permission/i.test(msg)) return 'Please sign in again and retry your payment.'
  if (/failed to fetch|network|timeout/i.test(msg)) return 'Network issue while starting checkout. Please try again.'
  return msg || 'Unable to start checkout. Please try again.'
}

/**
 * Create a checkout session for a subscription plan
 * @param input - Checkout parameters
 * @returns Promise with redirect URL or error
 */
export async function createCheckout(input: CheckoutInput): Promise<CheckoutResponse> {
  // This calls our serverless function which will:
  // 1) Lookup pricing from subscription_plans table
  // 2) Create billing_invoices and payment_transactions
  // 3) Create a PayFast payment request and return a redirect URL
  // 4) Handle enterprise tier by rejecting with "contact_sales_required"
  
  try {
    const { data, error } = await assertSupabase().functions.invoke('payments-create-checkout', {
      body: input as any,
    })
    
    if (error) {
      const rawMessage = extractCheckoutErrorMessage(error)
      return {
        error: toFriendlyCheckoutError(rawMessage || error.message)
      }
    }
    
    return data || { error: 'We couldn’t start checkout right now. Please try again in a minute.' }
    
  } catch (e: any) {
    const rawMessage = extractCheckoutErrorMessage(e)
    return {
      error: toFriendlyCheckoutError(rawMessage || e?.message)
    }
  }
}

/**
 * Cancel an active PayFast subscription
 */
export async function cancelSubscription(input: CancelSubscriptionInput): Promise<CancelSubscriptionResponse> {
  try {
    const { data, error } = await assertSupabase().functions.invoke('payments-cancel-subscription', {
      body: input as any,
    })

    if (error) {
      const rawMessage = extractCheckoutErrorMessage(error)
      return { error: rawMessage || error.message }
    }

    return data || { error: 'Unable to cancel subscription right now. Please try again.' }
  } catch (e: any) {
    const rawMessage = extractCheckoutErrorMessage(e)
    return { error: rawMessage || e?.message }
  }
}

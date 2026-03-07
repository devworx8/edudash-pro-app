import crypto from 'crypto';

/**
 * PayFast Payment Integration Utilities
 * Supports both sandbox and production environments
 */

export interface PayFastPaymentData {
  // Merchant details
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;

  // Transaction details
  name_first?: string;
  name_last?: string;
  email_address: string;
  cell_number?: string;

  // Item details
  m_payment_id: string; // Unique payment ID
  amount: number;
  item_name: string;
  item_description?: string;

  // Custom fields (passed through to webhook)
  custom_str1?: string; // user_id
  custom_str2?: string; // tier
  custom_str3?: string; // subscription_type
  custom_int1?: number;
  custom_int2?: number;

  // Subscription (recurring) details (optional)
  subscription_type?: '1' | '2'; // 1 = Subscription, 2 = Ad Hoc
  billing_date?: string; // YYYY-MM-DD
  recurring_amount?: number;
  frequency?: '3' | '4' | '5' | '6'; // 3=Monthly, 4=Quarterly, 5=Biannually, 6=Annual
  cycles?: number; // Number of payments (0 = until cancelled)
}

/**
 * Generate MD5 signature for PayFast payment
 * IMPORTANT: PayFast sandbox does NOT use passphrase - only production does
 * NOTE: This function is for server-side use only.
 * 
 * @param data - Payment data object
 * @param passphrase - PayFast passphrase (required for production, leave empty for sandbox)
 * @param mode - 'sandbox' or 'production' (default: 'sandbox')
 */
export function generatePayFastSignature(
  data: Record<string, any>, 
  passphrase?: string,
  mode: 'sandbox' | 'production' = 'sandbox'
): string {
  const isSandbox = mode === 'sandbox';
  
  // Create parameter string
  let paramString = '';
  
  // Sort keys alphabetically (CRITICAL for PayFast)
  const sortedKeys = Object.keys(data).sort();
  
  console.log('[PayFast Signature] Sorted keys:', sortedKeys);
  console.log('[PayFast Signature] Data values:', data);
  
  for (const key of sortedKeys) {
    if (key !== 'signature') {
      const value = data[key];
      if (value !== undefined && value !== null && value !== '') {
        const encodedValue = encodeURIComponent(String(value).trim()).replace(/%20/g, '+');
        paramString += `${key}=${encodedValue}&`;
        console.log(`[PayFast Signature] ${key}=${encodedValue}`);
      }
    }
  }
  
  // Remove trailing &
  paramString = paramString.slice(0, -1);
  
  // CRITICAL: PayFast sandbox does NOT use passphrase!
  // Only add passphrase for production mode
  if (!isSandbox && passphrase && passphrase.trim() !== '') {
    paramString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    console.log('[PayFast Signature] Added passphrase to param string');
  }
  
  // Generate MD5 hash
  const signature = crypto.createHash('md5').update(paramString).digest('hex');
  
  console.log('[PayFast Signature]', {
    mode: isSandbox ? 'sandbox' : 'production',
    hasPassphrase: !isSandbox && !!passphrase,
    paramStringLength: paramString.length,
    paramStringPreview: paramString.substring(0, 200) + '...',
    signature,
  });
  
  return signature;
}

/**
 * Build PayFast payment URL with all parameters
 * NOTE: This function is deprecated. Use the payfast-create-payment Edge Function instead.
 * 
 * @param paymentData - PayFast payment data
 * @param passphrase - PayFast passphrase (required for production, leave empty for sandbox)
 * @param mode - 'sandbox' or 'production' (default: 'sandbox')
 */
export function buildPayFastUrl(
  paymentData: PayFastPaymentData, 
  passphrase?: string,
  mode: 'sandbox' | 'production' = 'sandbox'
): string {
  const baseUrl = mode === 'sandbox' 
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';
  
  // Generate signature
  const signature = generatePayFastSignature(paymentData, passphrase, mode);
  
  // Build URL parameters
  const params = new URLSearchParams();
  Object.entries(paymentData).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  params.append('signature', signature);
  
  return `${baseUrl}?${params.toString()}`;
}

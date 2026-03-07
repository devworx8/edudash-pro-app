'use client';

import { useState } from 'react';
import { generatePayFastSignature } from '@/lib/payfast';

export default function TestPayFastSignature() {
  const [signature, setSignature] = useState('');
  const [paramString, setParamString] = useState('');

  const testData = {
    amount: '199',
    cancel_url: 'http://localhost:3000/dashboard/parent/subscription/payment=cancelled',
    custom_str1: 'a04eec26-74e1-4af25-08c-1a04e6e909',
    custom_str2: 'parent_plus',
    custom_str3: 'monthly_subscription',
    cycles: '0',
    email_address: 'oliviamakunyane@gmail.com',
    frequency: '3',
    item_description: 'Monthly subscription - 100 Homework Helper/month, Priority processing, Up to 3 children',
    item_name: 'Parent Plus',
    m_payment_id: 'SUB_PARENT_PLUS_a04eec26_1763258490917',
    merchant_id: '10000100',
    merchant_key: '46f0cd694581a',
    name_first: 'Olivia',
    name_last: 'Makunyane',
    notify_url: 'https://your-project.supabase.co/functions/v1/payfast-webhook', // Update with your Supabase URL
    recurring_amount: '199',
    return_url: 'http://localhost:3000/dashboard/parent/subscription/payment=success',
    subscription_type: '1',
  };

  const generateSig = () => {
    // Manually build parameter string to debug
    const sortedKeys = Object.keys(testData).sort();
    let params = '';
    
    for (const key of sortedKeys) {
      const value = testData[key as keyof typeof testData];
      if (value !== undefined && value !== null && value !== '') {
        params += `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, '+')}&`;
      }
    }
    
    // Remove trailing &
    params = params.slice(0, -1);
    
    setParamString(params);
    
    // Generate signature WITHOUT passphrase (sandbox mode)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const sig = crypto.createHash('md5').update(params).digest('hex');
    setSignature(sig);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>PayFast Signature Debugger</h1>
      
      <button 
        onClick={generateSig}
        style={{
          padding: '12px 24px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          marginBottom: '20px',
        }}
      >
        Generate Signature
      </button>

      {paramString && (
        <div style={{ marginBottom: '30px' }}>
          <h2>Parameter String:</h2>
          <pre style={{ 
            background: '#1e293b', 
            color: '#e2e8f0', 
            padding: '20px', 
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '12px',
            lineHeight: '1.6',
          }}>
            {paramString}
          </pre>
        </div>
      )}

      {signature && (
        <div>
          <h2>Generated Signature:</h2>
          <pre style={{ 
            background: '#1e293b', 
            color: '#10b981', 
            padding: '20px', 
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
          }}>
            {signature}
          </pre>
          
          <h2>Your Signature from Screenshot:</h2>
          <pre style={{ 
            background: '#1e293b', 
            color: '#ef4444', 
            padding: '20px', 
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
          }}>
            cf37f6b47684863548b47e66006a8d66
          </pre>

          {signature === 'cf37f6b47684863548b47e66006a8d66' ? (
            <p style={{ color: '#10b981', fontSize: '18px', fontWeight: 'bold' }}>
              ✅ SIGNATURES MATCH!
            </p>
          ) : (
            <p style={{ color: '#ef4444', fontSize: '18px', fontWeight: 'bold' }}>
              ❌ SIGNATURES DO NOT MATCH
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: '40px', background: '#fef3c7', padding: '20px', borderRadius: '8px' }}>
        <h3>⚠️ PayFast Sandbox Requirements:</h3>
        <ul>
          <li>Merchant ID: <code>10000100</code></li>
          <li>Merchant Key: <code>46f0cd694581a</code></li>
          <li><strong>NO PASSPHRASE</strong> in sandbox mode</li>
          <li>All parameters must be sorted alphabetically</li>
          <li>URL encoding with + for spaces</li>
        </ul>
      </div>
    </div>
  );
}

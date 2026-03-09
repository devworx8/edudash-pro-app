/** Pure utility helpers for registration-detail */
import { Linking } from 'react-native';
import type { Registration, ShowAlert } from './types';

export const calculateAge = (dob: string): string => {
  if (!dob) return 'N/A';
  const birthDate = new Date(dob);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (months < 0) { years--; months += 12; }
  return years === 0 ? `${months} months` : `${years} years, ${months} months`;
};

export const formatDate = (date: string | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const formatDateTime = (date: string | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const getStatusColor = (status: Registration['status']): string => {
  switch (status) {
    case 'approved': return '#10B981';
    case 'rejected': return '#EF4444';
    case 'pending': return '#F59E0B';
    default: return '#999';
  }
};

export const getStartMonthIso = (offset: number): string => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  // Use local date parts to avoid UTC-offset shifting the date (e.g. UTC+2 → previous day)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

export const canApprove = (reg: Registration): boolean => {
  const requiresPayment = (reg.registration_fee_amount || 0) > 0;
  if (!requiresPayment) return true;
  return !!reg.payment_verified;
};

export const openDocument = (url: string | undefined, name: string, showAlert: ShowAlert) => {
  if (!url) { showAlert('Not Available', `${name} has not been uploaded yet.`, 'warning'); return; }
  Linking.openURL(url).catch(() => { showAlert('Error', 'Could not open document', 'error'); });
};

export const callGuardian = (phone: string | undefined) => {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`);
};

export const emailGuardian = (email: string | undefined) => {
  if (!email) return;
  Linking.openURL(`mailto:${email}`);
};

export const whatsAppGuardian = (phone: string | undefined) => {
  if (!phone) return;
  const cleaned = phone.replace(/[^0-9]/g, '');
  const intl = cleaned.startsWith('0') ? `27${cleaned.slice(1)}` : cleaned;
  Linking.openURL(`whatsapp://send?phone=${intl}`);
};

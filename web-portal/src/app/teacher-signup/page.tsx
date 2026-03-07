import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

const BASE_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za';

export const metadata: Metadata = {
  title: 'Teacher Sign Up | EduDash Pro',
  description: 'Create your teacher account and join a school on EduDash Pro.',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: 'Teacher Sign Up | EduDash Pro',
    description: 'Create your teacher account and join a school on EduDash Pro.',
    url: `${BASE_URL}/teacher-signup`,
    siteName: 'EduDash Pro',
    images: [{ url: new URL('/icon-512.png', BASE_URL).toString() }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Teacher Sign Up | EduDash Pro',
    description: 'Create your teacher account and join a school on EduDash Pro.',
    images: [new URL('/icon-512.png', BASE_URL).toString()],
  },
};

type SearchParams = { [key: string]: string | string[] | undefined };

const getParam = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value[0] || '' : value;
};

export default function TeacherSignupRedirect({ searchParams }: { searchParams: SearchParams }) {
  const inviteCode = getParam(searchParams.inviteCode) || getParam(searchParams.invite);
  const email = getParam(searchParams.email);

  const query = new URLSearchParams();
  if (inviteCode) query.set('invite', inviteCode);
  if (email) query.set('email', email);

  redirect(`/sign-up/teacher${query.toString() ? `?${query.toString()}` : ''}`);
}

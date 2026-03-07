import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za';

export const metadata: Metadata = {
  title: 'Teacher Sign Up | EduDash Pro',
  description: 'Create your teacher account and join a school on EduDash Pro.',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: 'Teacher Sign Up | EduDash Pro',
    description: 'Create your teacher account and join a school on EduDash Pro.',
    url: `${BASE_URL}/sign-up/teacher`,
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

export default function TeacherSignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}

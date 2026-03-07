import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za';

export const metadata: Metadata = {
  title: 'Teacher Invitation | EduDash Pro',
  description: 'Accept your teacher invitation and join a school on EduDash Pro.',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: 'Teacher Invitation | EduDash Pro',
    description: 'Accept your teacher invitation and join a school on EduDash Pro.',
    url: `${BASE_URL}/invite/teacher`,
    siteName: 'EduDash Pro',
    images: [{ url: new URL('/icon-512.png', BASE_URL).toString() }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Teacher Invitation | EduDash Pro',
    description: 'Accept your teacher invitation and join a school on EduDash Pro.',
    images: [new URL('/icon-512.png', BASE_URL).toString()],
  },
};

export default function TeacherInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}

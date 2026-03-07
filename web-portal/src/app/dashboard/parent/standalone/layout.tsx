import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Standalone Parent Dashboard | EduDash Pro',
  description: 'Personal learning hub for independent parents - AI homework help, exam prep, and progress tracking',
};

export default function StandaloneParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

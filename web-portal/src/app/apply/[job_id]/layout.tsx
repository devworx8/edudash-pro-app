import type { Metadata } from 'next';
import { buildJobApplyMetadata } from '@/lib/metadata/jobPosting';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ job_id: string }>;
}): Promise<Metadata> {
  const { job_id } = await params;
  return buildJobApplyMetadata(job_id);
}

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

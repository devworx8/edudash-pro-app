import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildJobApplyMetadata } from '@/lib/metadata/jobPosting';

type SearchParams = { [key: string]: string | string[] | undefined };

const getParam = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value[0] || '' : value;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ job_id: string }>;
}): Promise<Metadata> {
  const { job_id } = await params;
  return buildJobApplyMetadata(job_id);
}

export default async function JobApplyRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ job_id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { job_id: jobId } = await params;
  const resolvedSearchParams = await searchParams;
  const query = new URLSearchParams();

  Object.entries(resolvedSearchParams || {}).forEach(([key, value]) => {
    const v = getParam(value);
    if (v) query.set(key, v);
  });

  redirect(`/apply/${jobId}${query.toString() ? `?${query.toString()}` : ''}`);
}

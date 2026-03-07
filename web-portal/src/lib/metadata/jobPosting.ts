import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

const BASE_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za';

const formatEmploymentType = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'full-time' || normalized === 'full_time') return 'Full-Time';
  if (normalized === 'part-time' || normalized === 'part_time') return 'Part-Time';
  if (normalized === 'contract') return 'Contract';
  if (normalized === 'temporary') return 'Temporary';
  return '';
};

const formatSalaryRange = (min?: number | null, max?: number | null) => {
  if (min && max) return `R${min} - R${max}`;
  if (min) return `From R${min}`;
  return '';
};

const truncate = (value: string, max = 180) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
};

const resolveImageUrl = (logoUrl?: string | null) => {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) return logoUrl;
  if (logoUrl) return new URL(logoUrl, BASE_URL).toString();
  return new URL('/icon-512.png', BASE_URL).toString();
};

export async function buildJobApplyMetadata(jobId: string): Promise<Metadata> {
  const fallbackTitle = 'Apply for Teaching Role | EduDash Pro';
  const fallbackDescription = 'Apply for this teaching role on EduDash Pro.';
  const fallbackImage = resolveImageUrl();

  if (!jobId) {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      metadataBase: new URL(BASE_URL),
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
        url: `${BASE_URL}/apply`,
        siteName: 'EduDash Pro',
        images: [{ url: fallbackImage }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: fallbackTitle,
        description: fallbackDescription,
        images: [fallbackImage],
      },
    };
  }

  try {
    const supabase = await createClient();
    const { data: job } = await supabase
      .from('job_postings')
      .select('title, description, location, employment_type, salary_range_min, salary_range_max, preschool_id, logo_url')
      .eq('id', jobId)
      .maybeSingle();

    let schoolName = '';
    let schoolLogo: string | null | undefined;

    if (job?.preschool_id) {
      const { data: preschool } = await supabase
        .from('preschools')
        .select('name, logo_url')
        .eq('id', job.preschool_id)
        .maybeSingle();
      if (preschool) {
        schoolName = preschool.name || '';
        schoolLogo = preschool.logo_url;
      } else {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, logo_url')
          .eq('id', job.preschool_id)
          .maybeSingle();
        if (org) {
          schoolName = org.name || '';
          schoolLogo = org.logo_url;
        }
      }
    }

    const titleParts = [job?.title, schoolName].filter(Boolean);
    const title = titleParts.length ? `${titleParts.join(' · ')} | EduDash Pro` : fallbackTitle;

    const detailParts = [
      job?.location,
      formatEmploymentType(job?.employment_type),
      formatSalaryRange(job?.salary_range_min ?? null, job?.salary_range_max ?? null),
    ].filter(Boolean);

    const description = job?.description
      ? truncate(job.description, 180)
      : detailParts.length
        ? `${detailParts.join(' • ')}. Apply now via EduDash Pro.`
        : fallbackDescription;

    const imageUrl = resolveImageUrl(job?.logo_url || schoolLogo);
    const url = `${BASE_URL}/apply/${jobId}`;

    return {
      title,
      description,
      metadataBase: new URL(BASE_URL),
      openGraph: {
        title,
        description,
        url,
        siteName: 'EduDash Pro',
        images: [{ url: imageUrl }],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch (error) {
    console.warn('[metadata] Job metadata fallback:', error);
  }

  return {
    title: fallbackTitle,
    description: fallbackDescription,
    metadataBase: new URL(BASE_URL),
    openGraph: {
      title: fallbackTitle,
      description: fallbackDescription,
      url: `${BASE_URL}/apply/${jobId}`,
      siteName: 'EduDash Pro',
      images: [{ url: fallbackImage }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fallbackTitle,
      description: fallbackDescription,
      images: [fallbackImage],
    },
  };
}

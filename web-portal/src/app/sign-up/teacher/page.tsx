import type { Metadata } from 'next';
import TeacherSignUpClient from '@/components/auth/TeacherSignUpClient';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za';

const resolveImageUrl = (logoUrl?: string | null) => {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) return logoUrl;
  if (logoUrl) return new URL(logoUrl, BASE_URL).toString();
  return new URL('/icon-512.png', BASE_URL).toString();
};

const firstParam = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value[0] : value;
};

export async function generateMetadata({
  searchParams,
}: {
  // Next 16+ passes `searchParams` as a Promise (sync dynamic APIs).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const inviteRaw = firstParam(sp.invite || sp.inviteCode || sp.code);
  const jobRaw = firstParam(sp.job || sp.jobId);
  const fallbackTitle = 'Teacher Sign Up | EduDash Pro';
  const fallbackDescription = 'Create your teacher account and join a school on EduDash Pro.';
  const fallbackImage = resolveImageUrl();

  if (!inviteRaw && !jobRaw) {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      metadataBase: new URL(BASE_URL),
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
        url: `${BASE_URL}/sign-up/teacher`,
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
    const inviteCode = inviteRaw?.trim() || '';
    let schoolId = '';
    let schoolName = '';
    let jobLogo: string | null | undefined = null;

    if (jobRaw) {
      const { data: job } = await supabase
        .from('job_postings')
        .select('logo_url, preschool_id')
        .eq('id', jobRaw)
        .maybeSingle();
      if (job) {
        jobLogo = job.logo_url;
        schoolId = job.preschool_id || '';
      }
    }

    if (inviteCode) {
      const { data } = await supabase.rpc('validate_invitation_code', { p_code: inviteCode });

      if (!data || typeof data !== 'object' || !(data as { valid?: boolean }).valid) {
        if (!jobRaw) {
          throw new Error('Invite not valid');
        }
      } else {
        schoolId = String((data as { school_id?: string }).school_id || schoolId || '');
        schoolName = String((data as { school_name?: string }).school_name || '');
      }
    }

    let logoUrl: string | null | undefined = jobLogo || null;
    if (schoolId) {
      const { data: preschool } = await supabase
        .from('preschools')
        .select('name, logo_url')
        .eq('id', schoolId)
        .maybeSingle();
      if (preschool) {
        if (preschool.logo_url) {
          logoUrl = preschool.logo_url;
        }
        if (!schoolName && preschool.name) {
          schoolName = preschool.name;
        }
      } else {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, logo_url')
          .eq('id', schoolId)
          .maybeSingle();
        if (org) {
          if (org.logo_url) {
            logoUrl = org.logo_url;
          }
          if (!schoolName && org.name) {
            schoolName = org.name;
          }
        }
      }
    }

    const title = schoolName ? `Teacher Sign Up · ${schoolName} | EduDash Pro` : fallbackTitle;
    const description = schoolName
      ? `Create your teacher account and join ${schoolName} on EduDash Pro.`
      : fallbackDescription;
    const imageUrl = resolveImageUrl(logoUrl);

    return {
      title,
      description,
      metadataBase: new URL(BASE_URL),
      openGraph: {
        title,
        description,
        url: `${BASE_URL}/sign-up/teacher${inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ''}${jobRaw ? `${inviteCode ? '&' : '?'}job=${encodeURIComponent(jobRaw)}` : ''}`,
        siteName: 'EduDash Pro',
        images: [{ url: imageUrl }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      },
    };
  } catch (error) {
    console.warn('[metadata] Teacher sign-up metadata fallback:', error);
  }

  return {
    title: fallbackTitle,
    description: fallbackDescription,
    metadataBase: new URL(BASE_URL),
    openGraph: {
      title: fallbackTitle,
      description: fallbackDescription,
      url: `${BASE_URL}/sign-up/teacher`,
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

export default function TeacherSignUpPage() {
  return <TeacherSignUpClient />;
}

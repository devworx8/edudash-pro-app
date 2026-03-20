/**
 * AI Vetting Service
 * 
 * Provides AI-powered candidate screening, background check automation,
 * and vetting score generation for teacher hiring.
 * 
 * Uses the ai-proxy edge function for Claude API calls.
 * ≤500 lines per WARP.md
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { CandidateProfile, JobPosting, ApplicationWithDetails } from '@/types/hiring';
import type { TeacherRatingSummary, TeacherReference } from '@/types/teacher-reputation';

// =====================================================
// TYPES
// =====================================================

export interface VettingCheckItem {
  id: string;
  label: string;
  category: 'identity' | 'qualifications' | 'experience' | 'references' | 'compliance' | 'background';
  status: 'passed' | 'failed' | 'pending' | 'not_applicable' | 'needs_review';
  details?: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface VettingScore {
  overall: number; // 0-100
  breakdown: {
    qualifications: number;
    experience: number;
    references: number;
    documentCompleteness: number;
    skillsMatch: number;
  };
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
  recommendations: string[];
}

export interface AIScreeningResult {
  score: number; // 0-100
  summary: string;
  strengths: string[];
  concerns: string[];
  interviewQuestions: string[];
  cultureFit: 'excellent' | 'good' | 'moderate' | 'poor';
  recommendation: 'strongly_recommend' | 'recommend' | 'consider' | 'not_recommended';
}

export interface VettingChecklist {
  items: VettingCheckItem[];
  completionPercentage: number;
  lastUpdated: string;
}

// SA-specific compliance checks
export const SA_VETTING_CHECKS: Omit<VettingCheckItem, 'status' | 'verifiedAt' | 'verifiedBy'>[] = [
  // Identity
  { id: 'id_verification', label: 'SA ID / Passport Verified', category: 'identity', details: 'Valid South African ID document or work permit' },
  { id: 'proof_of_address', label: 'Proof of Address', category: 'identity', details: 'Recent utility bill or bank statement' },
  
  // Qualifications
  { id: 'sace_registration', label: 'SACE Registration', category: 'qualifications', details: 'South African Council for Educators registration number' },
  { id: 'teaching_qualification', label: 'Teaching Qualification (BEd/PGCE)', category: 'qualifications', details: 'Verified degree or diploma in education' },
  { id: 'saqa_verification', label: 'SAQA Qualification Verification', category: 'qualifications', details: 'South African Qualifications Authority verification' },
  { id: 'first_aid_cert', label: 'First Aid Certificate', category: 'qualifications', details: 'Valid first aid certification (Level 1 minimum)' },
  
  // Experience
  { id: 'employment_history', label: 'Employment History Verified', category: 'experience', details: 'Previous employers contacted and verified' },
  { id: 'min_experience', label: 'Minimum Experience Met', category: 'experience', details: 'Meets minimum experience requirements for the position' },
  
  // References
  { id: 'ref_check_1', label: 'Reference 1 Verified', category: 'references', details: 'First professional reference contacted' },
  { id: 'ref_check_2', label: 'Reference 2 Verified', category: 'references', details: 'Second professional reference contacted' },
  
  // Compliance
  { id: 'police_clearance', label: 'Police Clearance Certificate', category: 'compliance', details: 'SAPS police clearance (within 6 months)' },
  { id: 'child_protection', label: 'Child Protection Screening', category: 'compliance', details: 'Not listed on National Register for Sex Offenders (NRSO)' },
  { id: 'sexual_offences_register', label: 'Sexual Offences Register Check', category: 'compliance', details: 'Not listed on National Child Protection Register (NCPR)' },
  
  // Background
  { id: 'credit_check', label: 'Credit Check (Optional)', category: 'background', details: 'Financial background check' },
  { id: 'social_media_review', label: 'Social Media Review', category: 'background', details: 'Professional conduct on public social media' },
];

// =====================================================
// SERVICE
// =====================================================

export class AIVettingService {

  /**
   * Generate initial vetting checklist for a candidate
   */
  static generateVettingChecklist(
    application: ApplicationWithDetails,
    candidate?: CandidateProfile | null
  ): VettingChecklist {
    const items: VettingCheckItem[] = SA_VETTING_CHECKS.map((check) => ({
      ...check,
      status: 'pending' as const,
    }));

    // Auto-evaluate some items based on available data
    if (candidate) {
      // Check if resume is uploaded
      if (application.has_resume) {
        const docItem = items.find(i => i.id === 'employment_history');
        if (docItem) docItem.status = 'needs_review';
      }

      // Check experience
      const expItem = items.find(i => i.id === 'min_experience');
      if (expItem && candidate.experience_years > 0) {
        expItem.status = 'needs_review';
        expItem.details = `${candidate.experience_years} years experience reported`;
      }

      // Check qualifications
      if (candidate.qualifications && candidate.qualifications.length > 0) {
        const qualItem = items.find(i => i.id === 'teaching_qualification');
        if (qualItem) {
          qualItem.status = 'needs_review';
          qualItem.details = candidate.qualifications.map(q => q.degree || q.field).filter(Boolean).join(', ');
        }
      }
    }

    const completed = items.filter(i => i.status === 'passed').length;
    const total = items.filter(i => i.status !== 'not_applicable').length;

    return {
      items,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Calculate vetting score based on candidate data, references, and checklist
   */
  static calculateVettingScore(
    candidate: CandidateProfile,
    checklist: VettingChecklist,
    ratingSummary?: TeacherRatingSummary | null,
    references?: TeacherReference[],
    jobPosting?: JobPosting | null
  ): VettingScore {
    const flags: string[] = [];
    const recommendations: string[] = [];

    // 1. Qualifications Score (0-25)
    let qualificationsScore = 0;
    const qualChecks = checklist.items.filter(i => i.category === 'qualifications');
    const passedQual = qualChecks.filter(i => i.status === 'passed').length;
    qualificationsScore = qualChecks.length > 0 ? Math.round((passedQual / qualChecks.length) * 25) : 0;
    
    if (candidate.qualifications.length === 0) {
      flags.push('No qualifications listed');
      recommendations.push('Request qualification certificates');
    }

    // 2. Experience Score (0-20)
    let experienceScore = 0;
    if (candidate.experience_years >= 5) experienceScore = 20;
    else if (candidate.experience_years >= 3) experienceScore = 15;
    else if (candidate.experience_years >= 1) experienceScore = 10;
    else {
      experienceScore = 5;
      flags.push('Entry-level candidate');
    }

    // 3. References Score (0-20)
    let referencesScore = 0;
    if (ratingSummary?.avg_rating) {
      referencesScore = Math.round((ratingSummary.avg_rating / 5) * 20);
    }
    if (!references || references.length === 0) {
      flags.push('No references available');
      recommendations.push('Request at least 2 professional references');
    } else if (references.length < 2) {
      recommendations.push('Request additional reference for thorough vetting');
    }

    // 4. Document Completeness Score (0-20)
    const complianceChecks = checklist.items.filter(
      i => i.category === 'compliance' || i.category === 'identity'
    );
    const passedCompliance = complianceChecks.filter(i => i.status === 'passed').length;
    const documentCompletenessScore = complianceChecks.length > 0
      ? Math.round((passedCompliance / complianceChecks.length) * 20)
      : 0;

    if (passedCompliance < complianceChecks.length) {
      const missing = complianceChecks.filter(i => i.status !== 'passed').map(i => i.label);
      if (missing.length > 0) {
        recommendations.push(`Outstanding compliance: ${missing.slice(0, 3).join(', ')}`);
      }
    }

    // 5. Skills Match Score (0-15)
    let skillsMatchScore = 0;
    if (jobPosting && candidate.skills.length > 0) {
      // Simple keyword matching
      const jobKeywords = (jobPosting.description + ' ' + (jobPosting.requirements || '')).toLowerCase().split(/\s+/);
      const matchedSkills = candidate.skills.filter(skill =>
        jobKeywords.some(kw => kw.includes(skill.toLowerCase()) || skill.toLowerCase().includes(kw))
      );
      skillsMatchScore = Math.min(15, Math.round((matchedSkills.length / Math.max(candidate.skills.length, 1)) * 15));
    }

    const overall = qualificationsScore + experienceScore + referencesScore + documentCompletenessScore + skillsMatchScore;
    const riskLevel: VettingScore['riskLevel'] = overall >= 70 ? 'low' : overall >= 40 ? 'medium' : 'high';

    if (riskLevel === 'high') {
      flags.push('High risk — thorough vetting recommended');
    }

    return {
      overall,
      breakdown: {
        qualifications: qualificationsScore,
        experience: experienceScore,
        references: referencesScore,
        documentCompleteness: documentCompletenessScore,
        skillsMatch: skillsMatchScore,
      },
      riskLevel,
      flags,
      recommendations,
    };
  }

  /**
   * AI-powered candidate screening using Claude via ai-proxy
   */
  static async aiScreenCandidate(
    candidate: CandidateProfile,
    jobPosting: JobPosting,
    references: TeacherReference[],
    ratingSummary: TeacherRatingSummary | null,
    coverLetter?: string | null
  ): Promise<AIScreeningResult> {
    const supabase = assertSupabase();

    const prompt = `You are an expert HR advisor for a South African preschool/education institution. Analyze this teacher candidate and provide a structured assessment.

**JOB POSTING:**
- Title: ${jobPosting.title}
- Description: ${jobPosting.description}
- Requirements: ${jobPosting.requirements || 'Not specified'}
- Employment Type: ${jobPosting.employment_type}
- Salary Range: R${jobPosting.salary_range_min || '?'} - R${jobPosting.salary_range_max || '?'}
- Location: ${jobPosting.location || 'Not specified'}

**CANDIDATE:**
- Name: ${candidate.first_name} ${candidate.last_name}
- Experience: ${candidate.experience_years} years
- Location: ${candidate.location_city || candidate.location || 'Not specified'}, ${candidate.location_province || ''}
- Qualifications: ${JSON.stringify(candidate.qualifications)}
- Skills: ${candidate.skills.join(', ') || 'None listed'}

**COVER LETTER:**
${coverLetter || 'Not provided'}

**REFERENCES (${references.length}):**
${references.map(r => `- ${r.school_name || 'School'}: ${r.rating_overall}/5 — "${r.comment || 'No comment'}"`).join('\n') || 'No references'}

**RATING SUMMARY:**
${ratingSummary ? `Average: ${ratingSummary.avg_rating}/5 (${ratingSummary.rating_count} ratings)` : 'No ratings'}

Respond in JSON format:
{
  "score": <0-100>,
  "summary": "<2-3 sentence overview>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "concerns": ["<concern 1>", ...],
  "interviewQuestions": ["<targeted question 1>", "<targeted question 2>", "<targeted question 3>"],
  "cultureFit": "<excellent|good|moderate|poor>",
  "recommendation": "<strongly_recommend|recommend|consider|not_recommended>"
}`;

    try {
      // §3.1: Quota pre-check before AI call
      const { assertQuotaForService: checkVetQuota } = await import('@/lib/ai/guards');
      const vetQuota = await checkVetQuota('chat_message');
      if (!vetQuota.allowed) throw new Error('AI quota exceeded — please upgrade or try again later.');

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          action: 'candidate_screening',
          content: prompt,
          userId: 'system',
          model: 'claude-haiku-4-5-20251001',
          maxTokens: 1000,
        },
      });

      if (error) throw error;

      // Parse JSON from response
      const responseText = data?.content || data?.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid AI response format');

      const result = JSON.parse(jsonMatch[0]) as AIScreeningResult;
      return result;
    } catch (err) {
      logger.error('[AIVettingService] AI screening failed', { error: err });
      // Return a default result on failure
      return {
        score: 0,
        summary: 'AI screening could not be completed. Please review the candidate manually.',
        strengths: [],
        concerns: ['AI screening unavailable — manual review required'],
        interviewQuestions: [
          'Tell us about your teaching philosophy.',
          'How do you handle challenging classroom situations?',
          'What experience do you have with early childhood development?',
        ],
        cultureFit: 'moderate',
        recommendation: 'consider',
      };
    }
  }

  /**
   * Update a vetting checklist item status
   */
  static updateChecklistItem(
    checklist: VettingChecklist,
    itemId: string,
    status: VettingCheckItem['status'],
    verifiedBy?: string
  ): VettingChecklist {
    const updatedItems = checklist.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          status,
          verifiedAt: status === 'passed' ? new Date().toISOString() : item.verifiedAt,
          verifiedBy: verifiedBy || item.verifiedBy,
        };
      }
      return item;
    });

    const completed = updatedItems.filter(i => i.status === 'passed').length;
    const total = updatedItems.filter(i => i.status !== 'not_applicable').length;

    return {
      items: updatedItems,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get vetting status summary text
   */
  static getVettingStatusText(score: VettingScore): string {
    if (score.overall >= 80) return 'Excellent Candidate';
    if (score.overall >= 60) return 'Strong Candidate';
    if (score.overall >= 40) return 'Needs Further Review';
    return 'Significant Concerns';
  }

  /**
   * Get risk level color
   */
  static getRiskColor(riskLevel: VettingScore['riskLevel']): string {
    switch (riskLevel) {
      case 'low': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
    }
  }

  /**
   * Get recommendation color
   */
  static getRecommendationColor(rec: AIScreeningResult['recommendation']): string {
    switch (rec) {
      case 'strongly_recommend': return '#059669';
      case 'recommend': return '#10B981';
      case 'consider': return '#F59E0B';
      case 'not_recommended': return '#EF4444';
    }
  }

  /**
   * Format recommendation label
   */
  static getRecommendationLabel(rec: AIScreeningResult['recommendation']): string {
    switch (rec) {
      case 'strongly_recommend': return 'Strongly Recommended';
      case 'recommend': return 'Recommended';
      case 'consider': return 'Consider';
      case 'not_recommended': return 'Not Recommended';
    }
  }
}

export default AIVettingService;

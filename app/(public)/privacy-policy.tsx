import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LegalHeading } from '@/components/legal/LegalHeading';
import { LegalText } from '@/components/legal/LegalText';
import { BackToHome } from '@/components/legal/BackToHome';
import { DesignSystem } from '@/constants/DesignSystem';

export default function PrivacyPolicy() {
  const handleEmailPress = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <LegalLayout>
      <BackToHome variant="header" />

      <LegalHeading level={1}>Privacy Policy</LegalHeading>
      
      <View style={{ marginBottom: DesignSystem.spacing.lg }}>
        <LegalText variant="bold">Effective Date: 26 October 2025</LegalText>
        <LegalText variant="bold">Last Updated: 26 October 2025</LegalText>
      </View>

      <LegalHeading level={2}>1. Introduction & Scope</LegalHeading>
      <LegalText>
        Welcome to EduDash Pro. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use our AI-powered educational platform for schools, preschools, tutoring programmes, educators, parents, and learners.
      </LegalText>
      <LegalText>
        We are committed to protecting the privacy and security of all users, with special attention to the protection of child and learner data in compliance with applicable international and South African regulations.
      </LegalText>

      <LegalHeading level={3}>Regulatory Compliance</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">GDPR</LegalText> (General Data Protection Regulation) - EU/EEA users
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">POPIA</LegalText> (Protection of Personal Information Act) - South African users
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">COPPA</LegalText> (Children's Online Privacy Protection Act) - Children under 13
      </LegalText>

      <LegalHeading level={2}>2. Information We Collect</LegalHeading>
      
      <LegalHeading level={3}>Account Information</LegalHeading>
      <LegalText>
        We collect basic account information necessary to provide our educational services: full name, email address, phone number, organization affiliation, role (teacher, parent, principal, student, admin, or similar), and date of birth for age verification and consent controls.
      </LegalText>

      <LegalHeading level={3}>Student & Child Information</LegalHeading>
      <LegalText variant="bold">With parental consent, we collect:</LegalText>
      <LegalText variant="list-item">Child or learner first name, age, and grade level</LegalText>
      <LegalText variant="list-item">Learning progress and assessment data</LegalText>
      <LegalText variant="list-item">Educational activities and assignments</LegalText>
      <LegalText variant="list-item">Attendance records</LegalText>
      <LegalText variant="list-item">Voice recordings (optional, for speech features)</LegalText>

      <LegalText variant="bold" style={{ marginTop: DesignSystem.spacing.md }}>
        Special Protections:
      </LegalText>
      <LegalText variant="list-item">Minimal data collection principle</LegalText>
      <LegalText variant="list-item">Parental consent required before collection</LegalText>
      <LegalText variant="list-item">Secure storage with encryption</LegalText>
      <LegalText variant="list-item">Core school, parent, educator, and learner flows are ad-free</LegalText>

      <LegalHeading level={3}>Usage & Analytics Data</LegalHeading>
      <LegalText>
        We collect device information (type, OS, app version), IP address, browser type, feature usage patterns, session duration and frequency, and error logs for service improvement purposes.
      </LegalText>

      <LegalHeading level={2}>3. How We Use Your Information</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Service Delivery:</LegalText> Provide educational features and AI tools
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Account Management:</LegalText> Authenticate users and manage subscriptions
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Communication:</LegalText> Send service updates and educational content
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Safety & Security:</LegalText> Protect against fraud and abuse
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Legal Compliance:</LegalText> Meet regulatory requirements
      </LegalText>

      <LegalText style={{ marginTop: DesignSystem.spacing.md }}>
        <LegalText variant="bold">AI Processing:</LegalText> All AI processing occurs server-side via secure Edge Functions. No child data is used to train external AI models.
      </LegalText>

      <LegalHeading level={2}>4. Children's Privacy & COPPA Compliance</LegalHeading>
      
      <LegalHeading level={3}>Parental Consent Requirement</LegalHeading>
      <LegalText>
        We obtain verifiable parental consent before collecting any personal information from children under 13 through email verification with confirmation code, in-app consent form signed digitally, or school administrator authorization for institutional accounts.
      </LegalText>

      <LegalHeading level={3}>Parental Rights</LegalHeading>
      <LegalText>Parents have the right to:</LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Review:</LegalText> View all data collected about their child
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Revoke Consent:</LegalText> Delete child's account at any time
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Refuse:</LegalText> Decline optional data collection (e.g., voice features)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Correct:</LegalText> Update inaccurate information
      </LegalText>

      <LegalText style={{ marginTop: DesignSystem.spacing.md }}>
        <LegalText variant="bold">Contact:</LegalText> Email{' '}
        <Pressable onPress={() => handleEmailPress('privacy@edudashpro.org.za')}>
          <LegalText variant="link">privacy@edudashpro.org.za</LegalText>
        </Pressable>
        {' '}to exercise these rights.
      </LegalText>

      <LegalHeading level={3}>No Behavioral Advertising to Children</LegalHeading>
      <LegalText variant="list-item">Child and learner accounts do not see third-party advertising in core product flows</LegalText>
      <LegalText variant="list-item">Teacher, parent, principal, admin, and school management workflows are ad-free</LegalText>
      <LegalText variant="list-item">Any limited sponsored placements are restricted to eligible adult community users and use non-personalized ads</LegalText>
      <LegalText variant="list-item">Development environments use test ad IDs only</LegalText>

      <LegalHeading level={2}>5. Data Subject Rights (GDPR & POPIA)</LegalHeading>
      <LegalText>All users have the following rights:</LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right of Access:</LegalText> Request a copy of your personal data
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right to Rectification:</LegalText> Correct inaccurate data
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right to Erasure:</LegalText> Request deletion of your data
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right to Object:</LegalText> Object to processing based on legitimate interests
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right to Data Portability:</LegalText> Receive data in machine-readable format
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Right to Restrict Processing:</LegalText> Request temporary suspension
      </LegalText>

      <LegalText style={{ marginTop: DesignSystem.spacing.md }}>
        <LegalText variant="bold">How to Exercise Your Rights:</LegalText> Contact{' '}
        <Pressable onPress={() => handleEmailPress('privacy@edudashpro.org.za')}>
          <LegalText variant="link">privacy@edudashpro.org.za</LegalText>
        </Pressable>
        {' '}with your request. We will respond within 30 days (GDPR) or 21 days (POPIA).
      </LegalText>

      <LegalHeading level={2}>6. Data Security Measures</LegalHeading>
      
      <LegalHeading level={3}>Technical Safeguards</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Encryption:</LegalText> Data encrypted at rest (AES-256) and in transit (TLS 1.3)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Authentication:</LegalText> Multi-factor authentication available
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Access Controls:</LegalText> Role-based access control (RBAC)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Row-Level Security:</LegalText> Multi-tenant data isolation via Supabase
      </LegalText>

      <LegalHeading level={3}>Infrastructure Security</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Hosting:</LegalText> Supabase (PostgreSQL) with SOC 2 Type II compliance
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Edge Functions:</LegalText> Secure server-side AI processing
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Monitoring:</LegalText> Real-time security monitoring via Sentry
      </LegalText>

      <LegalHeading level={2}>7. Third-Party Processors</LegalHeading>
      <LegalText>
        We share data with trusted service providers under strict data processing agreements:
      </LegalText>

      <LegalHeading level={3}>Core Infrastructure</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Supabase:</LegalText> Database, authentication (South Africa, EU) - SOC 2 Type II, GDPR
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Expo Services:</LegalText> App updates, notifications (US)
      </LegalText>

      <LegalHeading level={3}>AI & Analytics</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Anthropic Claude:</LegalText> AI content generation (US)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Azure Speech Services:</LegalText> Voice recognition - optional (South Africa)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Sentry:</LegalText> Error monitoring - production only (US)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">PostHog:</LegalText> Product analytics - production only (EU)
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Google AdMob:</LegalText> Limited non-personalized advertising for eligible adult community users only
      </LegalText>

      <LegalText style={{ marginTop: DesignSystem.spacing.md }}>
        <LegalText variant="bold">Third-Party Policies:</LegalText>
      </LegalText>
      <Pressable onPress={() => handleLinkPress('https://supabase.com/privacy')}>
        <LegalText variant="link">Supabase Privacy Policy</LegalText>
      </Pressable>
      <Pressable onPress={() => handleLinkPress('https://www.anthropic.com/privacy')}>
        <LegalText variant="link">Anthropic Privacy Policy</LegalText>
      </Pressable>
      <Pressable onPress={() => handleLinkPress('https://privacy.microsoft.com/')}>
        <LegalText variant="link">Microsoft Privacy Statement</LegalText>
      </Pressable>

      <LegalHeading level={2}>8. Data Retention & Deletion</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Active Accounts:</LegalText> Data retained while account is active
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">User Data:</LegalText> Deleted within 30 days of account closure
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Child Data:</LegalText> Deleted immediately upon parental request
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Legal Holds:</LegalText> Data retained if required by law (e.g., billing records for 7 years)
      </LegalText>

      <LegalHeading level={2}>9. International Data Transfers</LegalHeading>
      <LegalText>
        <LegalText variant="bold">Primary Data Storage:</LegalText> South Africa (Supabase Africa region)
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Secondary Processing:</LegalText> EU (AI services, analytics)
      </LegalText>
      <LegalText style={{ marginTop: DesignSystem.spacing.sm }}>
        We use Standard Contractual Clauses (SCCs) for EU-South Africa transfers and obtain explicit consent for transfers outside POPIA-protected regions.
      </LegalText>

      <LegalHeading level={2}>10. Contact Information</LegalHeading>
      
      <LegalHeading level={3}>Privacy Inquiries</LegalHeading>
      <LegalText>
        <LegalText variant="bold">Email:</LegalText>{' '}
        <Pressable onPress={() => handleEmailPress('privacy@edudashpro.org.za')}>
          <LegalText variant="link">privacy@edudashpro.org.za</LegalText>
        </Pressable>
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Website:</LegalText>{' '}
        <Pressable onPress={() => handleLinkPress('https://www.edudashpro.org.za')}>
          <LegalText variant="link">www.edudashpro.org.za</LegalText>
        </Pressable>
      </LegalText>

      <LegalHeading level={3}>Supervisory Authorities</LegalHeading>
      <LegalText variant="bold">South Africa - POPIA:</LegalText>
      <Pressable onPress={() => handleLinkPress('https://www.justice.gov.za/inforeg/')}>
        <LegalText variant="link">Information Regulator (South Africa)</LegalText>
      </Pressable>

      <LegalText style={{ marginTop: DesignSystem.spacing.sm }}>
        <LegalText variant="bold">EU - GDPR:</LegalText>
      </LegalText>
      <Pressable onPress={() => handleLinkPress('https://edpb.europa.eu/about-edpb/board/members_en')}>
        <LegalText variant="link">Contact your local Data Protection Authority</LegalText>
      </Pressable>

      <LegalHeading level={2}>11. Changes to This Policy</LegalHeading>
      <LegalText>
        We may update this Privacy Policy to reflect changes in legal requirements, new features or services, or feedback from users or regulators.
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Material Changes:</LegalText> 30 days advance notice via email and in-app notification
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Minor Updates:</LegalText> Posted immediately with "Last Updated" date change
      </LegalText>

      <View style={{ marginTop: DesignSystem.spacing.xxl, marginBottom: DesignSystem.spacing.lg }}>
        <LegalText variant="bold">Last Updated: 26 October 2025</LegalText>
        <LegalText variant="bold">Version: 1.0</LegalText>
      </View>

      <View style={{ 
        padding: DesignSystem.spacing.lg, 
        backgroundColor: DesignSystem.colors.surface, 
        borderRadius: 12,
        marginBottom: DesignSystem.spacing.xl,
      }}>
        <LegalText>
          By using EduDash Pro, you acknowledge that you have read and understood this Privacy Policy. For child or learner accounts, we require verifiable parent, guardian, or institutional consent before collection of personal information.
        </LegalText>
      </View>

      <BackToHome variant="footer" />
    </LegalLayout>
  );
}

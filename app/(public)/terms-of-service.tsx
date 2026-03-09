import React from 'react';
import { View, Pressable, Linking } from 'react-native';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LegalHeading } from '@/components/legal/LegalHeading';
import { LegalText } from '@/components/legal/LegalText';
import { BackToHome } from '@/components/legal/BackToHome';
import { DesignSystem } from '@/constants/DesignSystem';

export default function TermsOfService() {
  const handleEmailPress = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <LegalLayout>
      <BackToHome variant="header" />

      <LegalHeading level={1}>Terms of Service</LegalHeading>
      
      <View style={{ marginBottom: DesignSystem.spacing.lg }}>
        <LegalText variant="bold">Effective Date: 26 October 2025</LegalText>
        <LegalText variant="bold">Last Updated: 26 October 2025</LegalText>
      </View>

      <LegalHeading level={2}>1. Service Description</LegalHeading>
      <LegalText>
        EduDash Pro is an AI-powered educational platform for schools, preschools, tutoring centres, educators, parents, administrators, and learners. Our platform provides:
      </LegalText>
      <LegalText variant="list-item">Educational Content: Age- and stage-appropriate learning materials and activities</LegalText>
      <LegalText variant="list-item">AI-Powered Tools: Lesson planning, homework assistance, and progress tracking</LegalText>
      <LegalText variant="list-item">Multi-User Dashboard: Separate interfaces for principals, teachers, parents, and students</LegalText>
      <LegalText variant="list-item">Subscription-Based Access: Tiered plans for different institutional needs</LegalText>

      <LegalHeading level={2}>2. User Eligibility & Child Safety</LegalHeading>
      
      <LegalHeading level={3}>Eligible Users</LegalHeading>
      <LegalText variant="list-item">Educational Institutions: Schools, preschools, districts, tutoring programmes, and learning centres</LegalText>
      <LegalText variant="list-item">Educators: Teachers and educational staff (18+ years)</LegalText>
      <LegalText variant="list-item">Parents/Guardians: Adults (18+ years) acting on behalf of children</LegalText>
      <LegalText variant="list-item">Learners: Child and student accounts used under parent, guardian, or educator supervision where required</LegalText>

      <LegalHeading level={3}>Child Protection (COPPA Compliance)</LegalHeading>
      <LegalText variant="list-item">
        <LegalText variant="bold">Parental Consent:</LegalText> Required for all child accounts
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Supervised Use:</LegalText> Children must use the platform under adult supervision
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Limited Data Collection:</LegalText> We collect minimal data from children as outlined in our Privacy Policy
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Educational Purpose Only:</LegalText> All child interactions are for educational purposes
      </LegalText>
      <LegalText variant="list-item">
        <LegalText variant="bold">Ad-Free Core Flows:</LegalText> Teaching, parent, learner, finance, and school-management areas do not include third-party ads
      </LegalText>

      <LegalHeading level={2}>3. Subscription Terms & Billing</LegalHeading>
      
      <LegalHeading level={3}>Subscription Plans</LegalHeading>
      <LegalText variant="list-item">Free Tier: Basic features with limited AI quota</LegalText>
      <LegalText variant="list-item">Premium Tiers: Enhanced features with increased AI usage</LegalText>
      <LegalText variant="list-item">Enterprise: Full institutional access with administrative tools</LegalText>

      <LegalHeading level={3}>Billing & Payment</LegalHeading>
      <LegalText variant="list-item">Payment Processing: Handled securely through PayFast and approved payment providers</LegalText>
      <LegalText variant="list-item">Subscription Renewal: Automatic renewal unless cancelled</LegalText>
      <LegalText variant="list-item">Currency: Pricing in South African Rand (ZAR) and other supported currencies</LegalText>
      <LegalText variant="list-item">Payment Failure: Service may be suspended for non-payment</LegalText>

      <LegalHeading level={3}>Cancellation Policy</LegalHeading>
      <LegalText variant="list-item">Cancellation Right: Cancel subscription at any time through app settings or by contacting support</LegalText>
      <LegalText variant="list-item">Refund Policy: Determined by the payment provider (e.g., PayFast)</LegalText>
      <LegalText variant="list-item">Data Retention: Account data retained per our Privacy Policy</LegalText>
      <LegalText variant="list-item">No Pro-Rating: No refunds for partial billing periods</LegalText>

      <LegalHeading level={2}>4. Educational Content & AI Services</LegalHeading>
      
      <LegalHeading level={3}>Content Standards</LegalHeading>
      <LegalText variant="list-item">Age-Appropriate: Content is designed to match the intended learner age or stage</LegalText>
      <LegalText variant="list-item">Educational Value: Content aligned with classroom, tutoring, or early childhood learning goals as applicable</LegalText>
      <LegalText variant="list-item">Cultural Sensitivity: Respectful of diverse backgrounds and learning needs</LegalText>
      <LegalText variant="list-item">Quality Assurance: Regular review and updates of educational materials</LegalText>

      <LegalHeading level={3}>AI-Powered Features</LegalHeading>
      <LegalText variant="list-item">Lesson Generation: AI-created lesson plans reviewed by educational experts</LegalText>
      <LegalText variant="list-item">Homework Assistance: Age-appropriate help that encourages learning</LegalText>
      <LegalText variant="list-item">Progress Tracking: Analytics to support child development</LegalText>
      <LegalText variant="list-item">Usage Limits: AI quota limits per subscription tier</LegalText>

      <LegalHeading level={3}>Content Accuracy Disclaimer</LegalHeading>
      <LegalText>
        While we strive for accuracy, AI-generated content should be reviewed by qualified educators. EduDash Pro is not a substitute for professional educational guidance.
      </LegalText>

      <LegalHeading level={2}>5. User Responsibilities</LegalHeading>
      
      <LegalHeading level={3}>Account Security</LegalHeading>
      <LegalText variant="list-item">Login Credentials: Keep account information secure</LegalText>
      <LegalText variant="list-item">Authorized Use: Only authorized users may access institutional accounts</LegalText>
      <LegalText variant="list-item">Reporting: Report security concerns immediately</LegalText>

      <LegalHeading level={3}>Appropriate Use</LegalHeading>
      <LegalText variant="list-item">Educational Purpose: Use platform solely for educational activities</LegalText>
      <LegalText variant="list-item">Respectful Behavior: Maintain respectful communication between users</LegalText>
      <LegalText variant="list-item">Content Guidelines: Do not upload inappropriate content</LegalText>
      <LegalText variant="list-item">Privacy Respect: Respect privacy of other users, especially children</LegalText>

      <LegalHeading level={3}>Prohibited Activities</LegalHeading>
      <LegalText variant="list-item">Unauthorized Access: No attempts to breach security or access others' accounts</LegalText>
      <LegalText variant="list-item">Data Scraping: No automated data collection or scraping</LegalText>
      <LegalText variant="list-item">Harmful Content: No upload of violent, inappropriate, or harmful content</LegalText>
      <LegalText variant="list-item">Commercial Use: No use of educational content for unauthorized commercial purposes</LegalText>

      <LegalHeading level={2}>6. Data Protection & Privacy</LegalHeading>
      
      <LegalHeading level={3}>Privacy Policy Reference</LegalHeading>
      <LegalText>
        Our comprehensive{' '}
        <Pressable onPress={() => handleLinkPress('/privacy-policy')}>
          <LegalText variant="link">Privacy Policy</LegalText>
        </Pressable>
        {' '}governs data collection, use, and protection.
      </LegalText>

      <LegalHeading level={3}>GDPR & POPIA Compliance</LegalHeading>
      <LegalText variant="list-item">Data Rights: Users have rights to access, correct, and delete personal data</LegalText>
      <LegalText variant="list-item">Data Processing: Lawful basis for processing educational data</LegalText>
      <LegalText variant="list-item">Data Security: Industry-standard security measures protect user data</LegalText>
      <LegalText variant="list-item">Data Retention: Data retained only as long as necessary for educational purposes</LegalText>

      <LegalHeading level={3}>Child Data Protection</LegalHeading>
      <LegalText variant="list-item">Minimal Collection: Collect only necessary data for educational services</LegalText>
      <LegalText variant="list-item">Parental Rights: Parents can review and control child data</LegalText>
      <LegalText variant="list-item">Secure Storage: Special protection for child-related data</LegalText>
      <LegalText variant="list-item">No Third-Party Sharing: Child data not shared with third parties except as legally required</LegalText>

      <LegalHeading level={2}>7. Intellectual Property</LegalHeading>
      
      <LegalHeading level={3}>Platform Ownership</LegalHeading>
      <LegalText>
        EduDash Pro platform, including software, design, and original content, is owned by EduDash Pro.
      </LegalText>

      <LegalHeading level={3}>User-Generated Content</LegalHeading>
      <LegalText variant="list-item">Ownership: Users retain ownership of content they create or upload</LegalText>
      <LegalText variant="list-item">License Grant: Users grant us license to use content for platform operation</LegalText>
      <LegalText variant="list-item">Educational Use: Content may be used for educational purposes within the platform</LegalText>

      <LegalHeading level={3}>Respect for IP Rights</LegalHeading>
      <LegalText>
        Users must respect intellectual property rights of others and not infringe copyrights or trademarks.
      </LegalText>

      <LegalHeading level={2}>8. Service Availability & Updates</LegalHeading>
      
      <LegalHeading level={3}>Service Availability</LegalHeading>
      <LegalText variant="list-item">Best Efforts: We strive for high availability but cannot guarantee uninterrupted service</LegalText>
      <LegalText variant="list-item">Maintenance: Planned maintenance will be communicated in advance</LegalText>
      <LegalText variant="list-item">Updates: Platform updates may change features or functionality</LegalText>

      <LegalHeading level={3}>Technical Support</LegalHeading>
      <LegalText variant="list-item">Support Channels: Help available through in-app support and email</LegalText>
      <LegalText variant="list-item">Response Time: We aim to respond to support requests within 24-48 hours</LegalText>
      <LegalText variant="list-item">Educational Support: Guidance available for educators on platform use</LegalText>

      <LegalHeading level={2}>9. Limitation of Liability</LegalHeading>
      
      <LegalHeading level={3}>Educational Disclaimer</LegalHeading>
      <LegalText>
        EduDash Pro is a supplementary educational tool and does not replace qualified teaching or childcare.
      </LegalText>

      <LegalHeading level={3}>Limitation of Damages</LegalHeading>
      <LegalText>
        To the maximum extent permitted by law, our liability is limited to the amount paid for the subscription service.
      </LegalText>

      <LegalHeading level={3}>No Warranties</LegalHeading>
      <LegalText>
        Service provided "as is" without warranties of any kind, express or implied.
      </LegalText>

      <LegalHeading level={2}>10. Compliance & Legal</LegalHeading>
      
      <LegalHeading level={3}>Regulatory Compliance</LegalHeading>
      <LegalText variant="list-item">COPPA: Children's Online Privacy Protection Act compliance</LegalText>
      <LegalText variant="list-item">GDPR: General Data Protection Regulation compliance</LegalText>
      <LegalText variant="list-item">POPIA: Protection of Personal Information Act (South Africa) compliance</LegalText>
      <LegalText variant="list-item">Educational Standards: Alignment with early childhood education regulations</LegalText>

      <LegalHeading level={3}>Governing Law</LegalHeading>
      <LegalText>
        These terms are governed by the laws of South Africa and international child protection regulations.
      </LegalText>

      <LegalHeading level={3}>Dispute Resolution</LegalHeading>
      <LegalText variant="list-item">First Step: Contact our support team to resolve disputes</LegalText>
      <LegalText variant="list-item">Mediation: Disputes may be resolved through mediation</LegalText>
      <LegalText variant="list-item">Legal Action: Legal disputes subject to South African jurisdiction</LegalText>

      <LegalHeading level={2}>11. Account Termination</LegalHeading>
      
      <LegalHeading level={3}>Termination by User</LegalHeading>
      <LegalText>
        Users may terminate accounts at any time through app settings or by contacting support.
      </LegalText>

      <LegalHeading level={3}>Termination by Us</LegalHeading>
      <LegalText>We may terminate accounts for:</LegalText>
      <LegalText variant="list-item">Violation of these terms</LegalText>
      <LegalText variant="list-item">Non-payment of subscription fees</LegalText>
      <LegalText variant="list-item">Inappropriate use that endangers child safety</LegalText>
      <LegalText variant="list-item">Legal or regulatory requirements</LegalText>

      <LegalHeading level={3}>Effect of Termination</LegalHeading>
      <LegalText variant="list-item">Data Export: Users may export their data before termination</LegalText>
      <LegalText variant="list-item">Data Deletion: Personal data deleted according to Privacy Policy</LegalText>
      <LegalText variant="list-item">Outstanding Obligations: Payment obligations survive termination</LegalText>

      <LegalHeading level={2}>12. Changes to Terms</LegalHeading>
      
      <LegalHeading level={3}>Updates</LegalHeading>
      <LegalText>
        We may update these terms to reflect changes in our service, legal requirements, or business practices.
      </LegalText>

      <LegalHeading level={3}>Notification</LegalHeading>
      <LegalText variant="list-item">Advance Notice: 30 days notice for material changes</LegalText>
      <LegalText variant="list-item">Continued Use: Continued use constitutes acceptance of updated terms</LegalText>
      <LegalText variant="list-item">Rejection Rights: Users may terminate account if they don't accept changes</LegalText>

      <LegalHeading level={2}>13. Contact Information</LegalHeading>
      <LegalText>
        <LegalText variant="bold">EduDash Pro Support</LegalText>
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Email:</LegalText>{' '}
        <Pressable onPress={() => handleEmailPress('support@edudashpro.org.za')}>
          <LegalText variant="link">support@edudashpro.org.za</LegalText>
        </Pressable>
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Website:</LegalText>{' '}
        <Pressable onPress={() => handleLinkPress('https://www.edudashpro.org.za')}>
          <LegalText variant="link">www.edudashpro.org.za</LegalText>
        </Pressable>
      </LegalText>
      <LegalText>
        <LegalText variant="bold">Privacy Policy:</LegalText>{' '}
        <Pressable onPress={() => handleLinkPress('/privacy-policy')}>
          <LegalText variant="link">Privacy Policy</LegalText>
        </Pressable>
      </LegalText>

      <LegalText style={{ marginTop: DesignSystem.spacing.md }}>
        For child safety concerns or data protection inquiries, contact our privacy officer at{' '}
        <Pressable onPress={() => handleEmailPress('privacy@edudashpro.org.za')}>
          <LegalText variant="link">privacy@edudashpro.org.za</LegalText>
        </Pressable>
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
          By using EduDash Pro, you agree to these Terms of Service and our Privacy Policy. Please ensure that all users of your institutional or household account are aware of and agree to these terms.
        </LegalText>
      </View>

      <BackToHome variant="footer" />
    </LegalLayout>
  );
}

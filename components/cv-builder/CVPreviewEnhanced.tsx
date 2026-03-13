/**
 * Enhanced CV Preview Component
 * Professional print-ready CV preview with multiple templates
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CVSection } from './types';
import { CVTemplate, TEMPLATE_CONFIGS, SECTION_ICONS, TemplateColors } from './templates';
import { percentWidth } from '@/lib/progress/clampPercent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const A4_RATIO = 297 / 210; // A4 paper ratio
const PREVIEW_WIDTH = Math.min(SCREEN_WIDTH - 32, 595); // Max A4 width in points
const PREVIEW_HEIGHT = PREVIEW_WIDTH * A4_RATIO;

interface CVPreviewEnhancedProps {
  sections: CVSection[];
  cvTitle: string;
  profile: any;
  theme: any;
  insets: any;
  t: any;
  template?: CVTemplate;
  scale?: number;
}

export function CVPreviewEnhanced({ 
  sections, 
  cvTitle, 
  profile, 
  theme, 
  insets, 
  t,
  template = 'modern',
  scale = 1,
}: CVPreviewEnhancedProps) {
  const config = TEMPLATE_CONFIGS[template];
  const colors = config.colors;
  const personalSection = sections.find((s) => s.type === 'personal');
  const personalData = personalSection?.data || {};
  
  const fullName = personalData.fullName || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Your Name';

  const renderHeader = () => {
    switch (config.headerStyle) {
      case 'banner':
        return (
          <View style={[previewStyles.headerBanner, { backgroundColor: colors.headerBg }]}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={previewStyles.headerGradientStrip}
            />
            <Text style={[previewStyles.nameText, { color: colors.primary, fontSize: 28 * scale }]}>
              {fullName}
            </Text>
            {personalData.jobTitle && (
              <Text style={[previewStyles.jobTitleText, { color: colors.secondary, fontSize: 14 * scale }]}>
                {personalData.jobTitle}
              </Text>
            )}
            <View style={previewStyles.contactRow}>
              {renderContactItem('mail-outline', personalData.email)}
              {renderContactItem('call-outline', personalData.phone)}
              {renderContactItem('location-outline', personalData.address)}
              {renderContactItem('globe-outline', personalData.linkedin || personalData.website)}
            </View>
            {personalData.summary && (
              <Text style={[previewStyles.summaryText, { color: colors.textLight, fontSize: 11 * scale }]}>
                {personalData.summary}
              </Text>
            )}
          </View>
        );
      
      case 'centered':
        return (
          <View style={[previewStyles.headerCentered, { borderBottomColor: colors.primary }]}>
            <Text style={[previewStyles.nameTextCentered, { color: colors.text, fontSize: 32 * scale }]}>
              {fullName}
            </Text>
            {personalData.jobTitle && (
              <Text style={[previewStyles.jobTitleCentered, { color: colors.textLight, fontSize: 16 * scale }]}>
                {personalData.jobTitle}
              </Text>
            )}
            <View style={previewStyles.contactRowCentered}>
              <Text style={[previewStyles.contactTextCentered, { color: colors.textLight, fontSize: 10 * scale }]}>
                {[
                  personalData.email && `📧 ${personalData.email}`,
                  personalData.phone && `📱 ${personalData.phone}`,
                  personalData.address && `📍 ${personalData.address}`,
                ].filter(Boolean).join('  •  ')}
              </Text>
            </View>
            {personalData.summary && (
              <Text style={[previewStyles.summaryTextCentered, { color: colors.textLight, fontSize: 11 * scale }]}>
                {personalData.summary}
              </Text>
            )}
          </View>
        );
      
      case 'left':
      default:
        return (
          <View style={previewStyles.headerLeft}>
            <Text style={[previewStyles.nameTextLeft, { color: colors.text, fontSize: 26 * scale }]}>
              {fullName}
            </Text>
            {personalData.jobTitle && (
              <Text style={[previewStyles.jobTitleLeft, { color: colors.primary, fontSize: 14 * scale }]}>
                {personalData.jobTitle}
              </Text>
            )}
            <View style={previewStyles.contactGrid}>
              {renderContactItem('mail-outline', personalData.email, colors)}
              {renderContactItem('call-outline', personalData.phone, colors)}
              {renderContactItem('location-outline', personalData.address, colors)}
            </View>
            {personalData.summary && (
              <Text style={[previewStyles.summaryText, { color: colors.textLight, fontSize: 11 * scale }]}>
                {personalData.summary}
              </Text>
            )}
          </View>
        );
    }
  };

  const renderContactItem = (icon: string, value?: string, colorOverride?: TemplateColors) => {
    if (!value) return null;
    const c = colorOverride || colors;
    return (
      <View style={previewStyles.contactItem}>
        <Ionicons name={icon as any} size={12 * scale} color={c.textLight} />
        <Text style={[previewStyles.contactText, { color: c.textLight, fontSize: 10 * scale }]}>
          {value}
        </Text>
      </View>
    );
  };

  const renderSectionTitle = (section: CVSection) => {
    const icon = SECTION_ICONS[section.type] || 'document-outline';
    
    switch (config.sectionStyle) {
      case 'box':
        return (
          <View style={[previewStyles.sectionTitleBox, { backgroundColor: colors.headerBg, borderLeftColor: colors.primary }]}>
            <Ionicons name={icon as any} size={16 * scale} color={colors.primary} />
            <Text style={[previewStyles.sectionTitleText, { color: colors.primary, fontSize: 14 * scale }]}>
              {section.title}
            </Text>
          </View>
        );
      
      case 'icon':
        return (
          <View style={previewStyles.sectionTitleIcon}>
            <View style={[previewStyles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name={icon as any} size={14 * scale} color={colors.primary} />
            </View>
            <Text style={[previewStyles.sectionTitleText, { color: colors.text, fontSize: 13 * scale }]}>
              {section.title}
            </Text>
          </View>
        );
      
      case 'minimal':
        return (
          <Text style={[previewStyles.sectionTitleMinimal, { color: colors.text, fontSize: 12 * scale }]}>
            {section.title.toUpperCase()}
          </Text>
        );
      
      case 'underline':
      default:
        return (
          <View style={[previewStyles.sectionTitleUnderline, { borderBottomColor: colors.primary }]}>
            <Text style={[previewStyles.sectionTitleText, { color: colors.primary, fontSize: 14 * scale }]}>
              {section.title}
            </Text>
          </View>
        );
    }
  };

  const renderSectionContent = (section: CVSection) => {
    switch (section.type) {
      case 'experience':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.experienceItem}>
            <View style={previewStyles.experienceHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[previewStyles.experienceTitle, { color: colors.text, fontSize: 12 * scale }]}>
                  {item.position || 'Position'}
                </Text>
                <Text style={[previewStyles.experienceCompany, { color: colors.primary, fontSize: 11 * scale }]}>
                  {item.company || 'Company'}
                </Text>
              </View>
              <Text style={[previewStyles.experienceDate, { color: colors.textLight, fontSize: 10 * scale }]}>
                {item.startDate}{item.endDate ? ` - ${item.endDate}` : item.current ? ' - Present' : ''}
              </Text>
            </View>
            {item.description && (
              <Text style={[previewStyles.experienceDesc, { color: colors.textLight, fontSize: 10 * scale }]}>
                {item.description}
              </Text>
            )}
            {item.achievements && item.achievements.length > 0 && (
              <View style={previewStyles.bulletList}>
                {item.achievements.map((ach: string, i: number) => (
                  <View key={i} style={previewStyles.bulletItem}>
                    <Text style={[previewStyles.bullet, { color: colors.primary }]}>•</Text>
                    <Text style={[previewStyles.bulletText, { color: colors.textLight, fontSize: 10 * scale }]}>
                      {ach}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ));

      case 'education':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.educationItem}>
            <View style={previewStyles.educationHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[previewStyles.educationDegree, { color: colors.text, fontSize: 12 * scale }]}>
                  {item.degree || 'Degree'}
                </Text>
                <Text style={[previewStyles.educationSchool, { color: colors.primary, fontSize: 11 * scale }]}>
                  {item.institution || 'Institution'}
                </Text>
              </View>
              <Text style={[previewStyles.educationDate, { color: colors.textLight, fontSize: 10 * scale }]}>
                {item.startDate}{item.endDate ? ` - ${item.endDate}` : ''}
              </Text>
            </View>
            {item.field && (
              <Text style={[previewStyles.educationField, { color: colors.textLight, fontSize: 10 * scale }]}>
                Field: {item.field}
              </Text>
            )}
            {item.gpa && (
              <Text style={[previewStyles.educationGPA, { color: colors.textLight, fontSize: 10 * scale }]}>
                GPA: {item.gpa}
              </Text>
            )}
          </View>
        ));

      case 'skills':
        const skillsByCategory: Record<string, any[]> = {};
        (section.data.skills || []).forEach((skill: any) => {
          const cat = skill.category || 'Other';
          if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
          skillsByCategory[cat].push(skill);
        });
        
        return (
          <View style={previewStyles.skillsContainer}>
            {Object.entries(skillsByCategory).map(([category, skills]) => (
              <View key={category} style={previewStyles.skillCategory}>
                {Object.keys(skillsByCategory).length > 1 && (
                  <Text style={[previewStyles.skillCategoryTitle, { color: colors.textLight, fontSize: 10 * scale }]}>
                    {category}
                  </Text>
                )}
                <View style={previewStyles.skillTags}>
                  {skills.map((skill: any, idx: number) => (
                    <View 
                      key={idx} 
                      style={[
                        previewStyles.skillTag, 
                        { 
                          backgroundColor: colors.primary + '15',
                          borderColor: colors.primary + '30',
                        }
                      ]}
                    >
                      <Text style={[previewStyles.skillName, { color: colors.primary, fontSize: 9 * scale }]}>
                        {skill.name}
                      </Text>
                      {skill.level && (
                        <View style={previewStyles.skillLevel}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <View 
                              key={i}
                              style={[
                                previewStyles.skillDot,
                                { 
                                  backgroundColor: i <= (skill.level || 3) ? colors.primary : colors.primary + '30',
                                }
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        );

      case 'certifications':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.certItem}>
            <View style={previewStyles.certHeader}>
              <Ionicons name="ribbon" size={12 * scale} color={colors.primary} />
              <Text style={[previewStyles.certName, { color: colors.text, fontSize: 11 * scale }]}>
                {item.name || 'Certification'}
              </Text>
            </View>
            <Text style={[previewStyles.certIssuer, { color: colors.textLight, fontSize: 10 * scale }]}>
              {item.issuer}{item.date ? ` • ${item.date}` : ''}
            </Text>
            {item.credentialId && (
              <Text style={[previewStyles.certId, { color: colors.textLight, fontSize: 9 * scale }]}>
                ID: {item.credentialId}
              </Text>
            )}
          </View>
        ));

      case 'languages':
        return (
          <View style={previewStyles.languagesGrid}>
            {(section.data.languages || []).map((lang: any, idx: number) => (
              <View key={idx} style={previewStyles.languageItem}>
                <Text style={[previewStyles.languageName, { color: colors.text, fontSize: 11 * scale }]}>
                  {lang.name}
                </Text>
                <View style={[previewStyles.proficiencyBar, { backgroundColor: colors.primary + '20' }]}>
                  <View 
                    style={[
                      previewStyles.proficiencyFill, 
                      { 
                        backgroundColor: colors.primary,
                        width: percentWidth(getProficiencyPercent(lang.proficiency))
                      }
                    ]} 
                  />
                </View>
                <Text style={[previewStyles.proficiencyLabel, { color: colors.textLight, fontSize: 9 * scale }]}>
                  {lang.proficiency || 'Intermediate'}
                </Text>
              </View>
            ))}
          </View>
        );

      case 'projects':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.projectItem}>
            <Text style={[previewStyles.projectTitle, { color: colors.text, fontSize: 11 * scale }]}>
              {item.name || 'Project'}
            </Text>
            {item.description && (
              <Text style={[previewStyles.projectDesc, { color: colors.textLight, fontSize: 10 * scale }]}>
                {item.description}
              </Text>
            )}
            {item.technologies && (
              <Text style={[previewStyles.projectTech, { color: colors.primary, fontSize: 9 * scale }]}>
                Tech: {Array.isArray(item.technologies) ? item.technologies.join(', ') : item.technologies}
              </Text>
            )}
            {item.link && (
              <Text style={[previewStyles.projectLink, { color: colors.primary, fontSize: 9 * scale }]}>
                🔗 {item.link}
              </Text>
            )}
          </View>
        ));

      case 'references':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.referenceItem}>
            <Text style={[previewStyles.refName, { color: colors.text, fontSize: 11 * scale }]}>
              {item.name || 'Reference'}
            </Text>
            <Text style={[previewStyles.refPosition, { color: colors.primary, fontSize: 10 * scale }]}>
              {item.position}{item.company ? ` at ${item.company}` : ''}
            </Text>
            <Text style={[previewStyles.refContact, { color: colors.textLight, fontSize: 9 * scale }]}>
              {[item.email, item.phone].filter(Boolean).join(' • ')}
            </Text>
          </View>
        ));

      case 'achievements':
      case 'volunteer':
        return (section.data.items || []).map((item: any, idx: number) => (
          <View key={idx} style={previewStyles.achievementItem}>
            <View style={previewStyles.achievementHeader}>
              <Text style={[previewStyles.achievementTitle, { color: colors.text, fontSize: 11 * scale }]}>
                {item.title || item.role || 'Achievement'}
              </Text>
              {item.date && (
                <Text style={[previewStyles.achievementDate, { color: colors.textLight, fontSize: 9 * scale }]}>
                  {item.date}
                </Text>
              )}
            </View>
            {item.organization && (
              <Text style={[previewStyles.achievementOrg, { color: colors.primary, fontSize: 10 * scale }]}>
                {item.organization}
              </Text>
            )}
            {item.description && (
              <Text style={[previewStyles.achievementDesc, { color: colors.textLight, fontSize: 10 * scale }]}>
                {item.description}
              </Text>
            )}
          </View>
        ));

      default:
        return null;
    }
  };

  return (
    <ScrollView 
      style={previewStyles.container}
      contentContainerStyle={[previewStyles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <View 
        style={[
          previewStyles.paper, 
          { 
            backgroundColor: colors.background,
            width: PREVIEW_WIDTH,
            minHeight: PREVIEW_HEIGHT,
            shadowColor: '#000',
          }
        ]}
      >
        {renderHeader()}
        
        <View style={previewStyles.sectionsContainer}>
          {sections.filter((s) => s.type !== 'personal').map((section) => (
            <View key={section.id} style={previewStyles.section}>
              {renderSectionTitle(section)}
              {renderSectionContent(section)}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function getProficiencyPercent(level?: string): number {
  const map: Record<string, number> = {
    'native': 100,
    'fluent': 90,
    'advanced': 80,
    'intermediate': 60,
    'basic': 40,
    'beginner': 20,
  };
  return map[level?.toLowerCase() || 'intermediate'] || 60;
}

const previewStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingVertical: 16 },
  paper: { 
    borderRadius: 4, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 12, 
    elevation: 8,
    overflow: 'hidden',
  },
  
  // Banner header
  headerBanner: { padding: 24, paddingTop: 32 },
  headerGradientStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  nameText: { fontWeight: '700', marginBottom: 4 },
  jobTitleText: { fontWeight: '500', marginBottom: 12 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  summaryText: { lineHeight: 18, marginTop: 8 },
  
  // Centered header
  headerCentered: { padding: 24, alignItems: 'center', borderBottomWidth: 2 },
  nameTextCentered: { fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  jobTitleCentered: { marginBottom: 12, textAlign: 'center' },
  contactRowCentered: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  contactTextCentered: { textAlign: 'center' },
  summaryTextCentered: { textAlign: 'center', lineHeight: 18, marginTop: 8, maxWidth: '90%' },
  
  // Left header
  headerLeft: { padding: 24 },
  nameTextLeft: { fontWeight: '700', marginBottom: 4 },
  jobTitleLeft: { fontWeight: '500', marginBottom: 12 },
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  
  // Contact items
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: {},
  
  // Sections container
  sectionsContainer: { padding: 24, paddingTop: 16 },
  section: { marginBottom: 20 },
  
  // Section titles
  sectionTitleUnderline: { borderBottomWidth: 2, paddingBottom: 6, marginBottom: 12 },
  sectionTitleBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderLeftWidth: 4, marginBottom: 12 },
  sectionTitleIcon: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitleMinimal: { letterSpacing: 2, fontWeight: '600', marginBottom: 12 },
  sectionTitleText: { fontWeight: '700' },
  
  // Experience
  experienceItem: { marginBottom: 16 },
  experienceHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  experienceTitle: { fontWeight: '600' },
  experienceCompany: { fontWeight: '500' },
  experienceDate: {},
  experienceDesc: { marginTop: 4, lineHeight: 16 },
  bulletList: { marginTop: 6 },
  bulletItem: { flexDirection: 'row', marginBottom: 2 },
  bullet: { marginRight: 6, fontWeight: '700' },
  bulletText: { flex: 1, lineHeight: 16 },
  
  // Education
  educationItem: { marginBottom: 14 },
  educationHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  educationDegree: { fontWeight: '600' },
  educationSchool: { fontWeight: '500' },
  educationDate: {},
  educationField: { marginTop: 2 },
  educationGPA: {},
  
  // Skills
  skillsContainer: {},
  skillCategory: { marginBottom: 12 },
  skillCategoryTitle: { fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  skillTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  skillName: { fontWeight: '500' },
  skillLevel: { flexDirection: 'row', gap: 2 },
  skillDot: { width: 4, height: 4, borderRadius: 2 },
  
  // Certifications
  certItem: { marginBottom: 12 },
  certHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  certName: { fontWeight: '600' },
  certIssuer: { marginTop: 2 },
  certId: { marginTop: 2, fontStyle: 'italic' },
  
  // Languages
  languagesGrid: { gap: 10 },
  languageItem: { marginBottom: 8 },
  languageName: { fontWeight: '500', marginBottom: 4 },
  proficiencyBar: { height: 6, borderRadius: 3, marginBottom: 2 },
  proficiencyFill: { height: '100%', borderRadius: 3 },
  proficiencyLabel: { textTransform: 'capitalize' },
  
  // Projects
  projectItem: { marginBottom: 14 },
  projectTitle: { fontWeight: '600', marginBottom: 2 },
  projectDesc: { lineHeight: 16, marginBottom: 4 },
  projectTech: { fontWeight: '500', marginBottom: 2 },
  projectLink: {},
  
  // References
  referenceItem: { marginBottom: 12 },
  refName: { fontWeight: '600' },
  refPosition: { marginTop: 2 },
  refContact: { marginTop: 2 },
  
  // Achievements/Volunteer
  achievementItem: { marginBottom: 12 },
  achievementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  achievementTitle: { fontWeight: '600', flex: 1 },
  achievementDate: {},
  achievementOrg: { marginTop: 2, fontWeight: '500' },
  achievementDesc: { marginTop: 4, lineHeight: 16 },
});

export default CVPreviewEnhanced;

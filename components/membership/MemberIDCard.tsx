/**
 * Member ID Card Component
 * Professional digital ID card with QR code - print ready
 */
import React, { useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { 
  OrganizationMember, 
  MemberIDCard, 
  CardTemplate, 
  CARD_TEMPLATES,
  MEMBER_TYPE_LABELS,
  MEMBERSHIP_TIER_LABELS,
  STATUS_COLORS,
  isExecutiveMemberType,
} from './types';

// Standard ID card dimensions (credit card size: 85.6mm x 53.98mm)
const CARD_RATIO = 85.6 / 53.98;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 32, 400);
const CARD_HEIGHT = CARD_WIDTH / CARD_RATIO;

interface MemberIDCardProps {
  member: OrganizationMember;
  card: MemberIDCard;
  template?: CardTemplate;
  showBack?: boolean;
  scale?: number;
}

export function MemberIDCardFront({ 
  member, 
  card, 
  template = 'standard',
  scale = 1 
}: MemberIDCardProps) {
  const config = CARD_TEMPLATES[template];
  const qrRef = useRef(null);
  
  const fullName = `${member.first_name} ${member.last_name}`;
  const statusColor = STATUS_COLORS[member.membership_status] || STATUS_COLORS.pending;
  
  // Only executive members get their photo displayed on the card
  const showPhoto = isExecutiveMemberType(member.member_type);
  
  const formattedExpiry = useMemo(() => {
    if (!card.expiry_date) return 'N/A';
    const date = new Date(card.expiry_date);
    return date.toLocaleDateString('en-ZA', { month: '2-digit', year: '2-digit' });
  }, [card.expiry_date]);

  return (
    <View style={[
      styles.card, 
      { 
        width: CARD_WIDTH * scale, 
        height: CARD_HEIGHT * scale,
        backgroundColor: config.backgroundColor,
      }
    ]}>
      {/* Background Pattern */}
      {config.pattern !== 'none' && (
        <View style={styles.patternOverlay}>
          <PatternBackground pattern={config.pattern} color={config.primaryColor} />
        </View>
      )}
      
      {/* Top Gradient Bar */}
      <LinearGradient
        colors={config.gradientColors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topBar}
      >
        {/* Organization Logo & Name */}
        <View style={styles.orgSection}>
          {member.organization?.logo_url ? (
            <Image 
              source={{ uri: member.organization.logo_url }} 
              style={styles.orgLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.orgLogoPlaceholder, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="business" size={20 * scale} color="#fff" />
            </View>
          )}
          <View style={styles.orgInfo}>
            <Text style={[styles.orgName, { fontSize: 14 * scale }]} numberOfLines={1}>
              {member.organization?.name || 'SOIL OF AFRICA'}
            </Text>
            <Text style={[styles.cardType, { fontSize: 8 * scale }]}>
              MEMBERSHIP CARD
            </Text>
          </View>
        </View>
        
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={[styles.statusText, { fontSize: 7 * scale }]}>
            {member.membership_status.toUpperCase()}
          </Text>
        </View>
      </LinearGradient>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Photo Section - Only executives get photos */}
        <View style={styles.photoSection}>
          <View style={[
            styles.photoContainer, 
            { 
              borderColor: config.primaryColor,
              width: 70 * scale,
              height: 90 * scale,
            }
          ]}>
            {showPhoto && member.photo_url ? (
              <Image 
                source={{ uri: member.photo_url }} 
                style={[styles.photo, { resizeMode: 'cover' }]}
                resizeMode="cover"
              />
            ) : showPhoto && !member.photo_url ? (
              // Executive without photo - show placeholder with person icon
              <View style={[styles.photoPlaceholder, { backgroundColor: config.primaryColor + '15' }]}>
                <Ionicons name="person" size={40 * scale} color={config.primaryColor} />
              </View>
            ) : (
              // Non-executive - show org logo or generic organization badge
              <View style={[styles.photoPlaceholder, { backgroundColor: config.primaryColor + '10' }]}>
                {member.organization?.logo_url ? (
                  <Image 
                    source={{ uri: member.organization.logo_url }} 
                    style={{ width: 50 * scale, height: 50 * scale }}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons name="shield-checkmark" size={36 * scale} color={config.primaryColor} />
                    <Text style={{ fontSize: 6 * scale, color: config.primaryColor, marginTop: 2, fontWeight: '600' }}>
                      MEMBER
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          
          {/* Tier Badge */}
          <View style={[styles.tierBadge, { backgroundColor: config.accentColor + '20' }]}>
            <Text style={[styles.tierText, { color: config.primaryColor, fontSize: 8 * scale }]}>
              {MEMBERSHIP_TIER_LABELS[member.membership_tier]}
            </Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          {/* Name */}
          <Text style={[styles.memberName, { color: config.textColor, fontSize: 16 * scale }]} numberOfLines={1}>
            {fullName}
          </Text>
          
          {/* Member Type */}
          <Text style={[styles.memberType, { color: config.primaryColor, fontSize: 10 * scale }]}>
            {MEMBER_TYPE_LABELS[member.member_type]}
          </Text>
          
          {/* Member Number */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { fontSize: 8 * scale }]}>MEMBER NO.</Text>
            <Text style={[styles.infoValue, { color: config.textColor, fontSize: 11 * scale }]}>
              {member.member_number}
            </Text>
          </View>
          
          {/* Region */}
          {member.region && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { fontSize: 8 * scale }]}>REGION</Text>
              <Text style={[styles.infoValue, { color: config.textColor, fontSize: 10 * scale }]}>
                {member.region.name}
              </Text>
            </View>
          )}
          
          {/* Valid Until */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { fontSize: 8 * scale }]}>VALID UNTIL</Text>
            <Text style={[styles.infoValue, { color: config.textColor, fontSize: 10 * scale }]}>
              {formattedExpiry}
            </Text>
          </View>
        </View>

        {/* QR Code */}
        <View style={styles.qrSection}>
          <View style={[styles.qrContainer, { padding: 4 * scale }]}>
            <QRCode
              value={card.qr_code_data || `MEMBER:${member.member_number}`}
              size={60 * scale}
              backgroundColor="white"
              color={config.primaryColor}
              ref={qrRef}
            />
          </View>
          <Text style={[styles.qrLabel, { fontSize: 6 * scale }]}>
            SCAN TO VERIFY
          </Text>
        </View>
      </View>

      {/* Bottom Bar - Card Number prominently displayed */}
      <View style={[styles.bottomBar, { backgroundColor: config.primaryColor + '10' }]}>
        <View style={styles.bottomCenter}>
          <Text style={[styles.cardNumberLabel, { color: config.textColor + '80', fontSize: 6 * scale }]}>
            CARD NUMBER
          </Text>
          <Text style={[styles.cardNumberValue, { color: config.textColor, fontSize: 10 * scale, fontWeight: '700', letterSpacing: 1 }]}>
            {member.member_number}
          </Text>
        </View>
        <View style={styles.bottomRight}>
          <Text style={[styles.issueDate, { color: config.textColor + '80', fontSize: 7 * scale }]}>
            Issued: {new Date(card.issue_date).toLocaleDateString('en-ZA')}
          </Text>
        </View>
      </View>

      {/* Security Hologram Effect */}
      <View style={[styles.hologramStrip, { backgroundColor: config.accentColor + '30' }]} />
    </View>
  );
}

export function MemberIDCardBack({ 
  member, 
  card, 
  template = 'standard',
  scale = 1 
}: MemberIDCardProps) {
  const config = CARD_TEMPLATES[template];
  
  return (
    <View style={[
      styles.card, 
      styles.cardBack,
      { 
        width: CARD_WIDTH * scale, 
        height: CARD_HEIGHT * scale,
        backgroundColor: config.backgroundColor,
      }
    ]}>
      {/* Magnetic Strip */}
      <View style={[styles.magneticStrip, { backgroundColor: config.primaryColor }]} />
      
      {/* Barcode Section */}
      <View style={styles.barcodeSection}>
        <View style={styles.barcode}>
          {/* Simulated barcode lines */}
          {Array.from({ length: 40 }).map((_, i) => (
            <View 
              key={i}
              style={[
                styles.barcodeLine,
                { 
                  width: Math.random() > 0.5 ? 2 : 1,
                  backgroundColor: config.textColor,
                }
              ]}
            />
          ))}
        </View>
        <Text style={[styles.barcodeText, { fontSize: 8 * scale }]}>
          {member.member_number}
        </Text>
      </View>

      {/* Emergency Contact */}
      <View style={styles.backInfoSection}>
        <Text style={[styles.backTitle, { color: config.primaryColor, fontSize: 10 * scale }]}>
          EMERGENCY CONTACT
        </Text>
        <Text style={[styles.backText, { fontSize: 8 * scale }]}>
          Contact the nearest regional office
        </Text>
        <Text style={[styles.backText, { fontSize: 8 * scale }]}>
          or call: 0800-SOA-HELP (0800-762-4357)
        </Text>
      </View>

      {/* Terms */}
      <View style={styles.termsSection}>
        <Text style={[styles.termsText, { fontSize: 6 * scale }]}>
          This card remains the property of {member.organization?.name || 'EduPro'}.
          {'\n'}If found, please return to the nearest branch or mail to:
          {'\n'}P.O. Box 12345, Johannesburg, 2000
        </Text>
      </View>

      {/* Signature Strip */}
      <View style={styles.signatureSection}>
        <View style={[styles.signatureStrip, { backgroundColor: '#F3F4F6' }]}>
          <Text style={[styles.signatureLabel, { fontSize: 6 * scale }]}>
            AUTHORIZED SIGNATURE
          </Text>
        </View>
      </View>

      {/* Website */}
      <View style={styles.websiteSection}>
        <Text style={[styles.websiteText, { color: config.primaryColor, fontSize: 8 * scale }]}>
          www.soilofafrica.org
        </Text>
      </View>
    </View>
  );
}

// Pattern Background Component
function PatternBackground({ pattern, color }: { pattern: string; color: string }) {
  const opacity = 0.03;
  
  if (pattern === 'dots') {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity }]}>
        {Array.from({ length: 20 }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {Array.from({ length: 30 }).map((_, col) => (
              <View 
                key={col} 
                style={{ 
                  width: 3, 
                  height: 3, 
                  borderRadius: 1.5, 
                  backgroundColor: color,
                  margin: 4,
                }} 
              />
            ))}
          </View>
        ))}
      </View>
    );
  }
  
  if (pattern === 'lines') {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity }]}>
        {Array.from({ length: 50 }).map((_, i) => (
          <View 
            key={i} 
            style={{ 
              height: 1, 
              backgroundColor: color,
              marginVertical: 3,
            }} 
          />
        ))}
      </View>
    );
  }
  
  if (pattern === 'waves') {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity: opacity * 2, overflow: 'hidden' }]}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View 
            key={i} 
            style={{ 
              position: 'absolute',
              width: 400,
              height: 400,
              borderRadius: 200,
              borderWidth: 1,
              borderColor: color,
              top: 50 + i * 30,
              left: -100 + i * 20,
            }} 
          />
        ))}
      </View>
    );
  }
  
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardBack: {},
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  
  // Top Bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orgSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orgLogo: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  orgLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgInfo: {
    marginLeft: 8,
    flex: 1,
  },
  orgName: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardType: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    letterSpacing: 1,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Main Content
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    paddingTop: 8,
  },
  
  // Photo Section
  photoSection: {
    alignItems: 'center',
  },
  photoContainer: {
    borderWidth: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  tierText: {
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Info Section
  infoSection: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  memberName: {
    fontWeight: '700',
    marginBottom: 2,
  },
  memberType: {
    fontWeight: '600',
    marginBottom: 8,
  },
  infoRow: {
    marginBottom: 4,
  },
  infoLabel: {
    color: '#9CA3AF',
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  infoValue: {
    fontWeight: '600',
  },

  // QR Section
  qrSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  qrLabel: {
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bottomLeft: {},
  bottomCenter: {
    flex: 1,
    alignItems: 'flex-start',
  },
  bottomRight: {
    alignItems: 'flex-end',
  },
  cardNumber: {
    fontWeight: '500',
  },
  cardNumberLabel: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardNumberValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  issueDate: {},

  // Hologram
  hologramStrip: {
    position: 'absolute',
    bottom: 25,
    right: 80,
    width: 40,
    height: 40,
    borderRadius: 20,
    transform: [{ scaleX: 2 }],
    opacity: 0.5,
  },

  // Back Card
  magneticStrip: {
    height: 30,
    marginTop: 16,
  },
  barcodeSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  barcode: {
    flexDirection: 'row',
    height: 40,
    alignItems: 'center',
    gap: 1,
  },
  barcodeLine: {
    height: '100%',
  },
  barcodeText: {
    color: '#374151',
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: 4,
  },
  backInfoSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  backTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  backText: {
    color: '#6B7280',
  },
  termsSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  termsText: {
    color: '#9CA3AF',
    lineHeight: 10,
    textAlign: 'center',
  },
  signatureSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  signatureStrip: {
    height: 24,
    borderRadius: 4,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  signatureLabel: {
    color: '#9CA3AF',
  },
  websiteSection: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  websiteText: {
    fontWeight: '600',
  },
});

export default MemberIDCardFront;

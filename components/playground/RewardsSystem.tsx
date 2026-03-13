import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { ratioToPercent } from '../../lib/progress/clampPercent';

interface Reward {
  id: string;
  type: 'star' | 'badge' | 'collectible' | 'celebration';
  name: string;
  description: string;
  earnedAt: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: AchievementRequirement;
  progress: number;
  target: number;
  unlocked: boolean;
  unlockedAt?: string;
}

interface AchievementRequirement {
  type: 'activities_complete' | 'perfect_score' | 'streak_days' | 'subject_master' | 'speed_demon';
  subject?: string;
  count: number;
}

interface RewardsSystemProps {
  childId: string;
  onRewardEarned?: (reward: Reward) => void;
  onAchievementUnlocked?: (achievement: Achievement) => void;
}

const { width } = Dimensions.get('window');

const CELEBRATION_EMOJIS = ['🎉', '⭐', '🏆', '🌟', '💫', '🎯', '👏', '🚀'];

const BADGE_ICONS: Record<string, string> = {
  'first_activity': 'rocket',
  'perfect_score': 'star',
  'streak_3': 'flame',
  'streak_7': 'bonfire',
  'math_master': 'calculator',
  'reading_hero': 'book',
  'explorer': 'compass',
  'creative_kid': 'color-palette',
  'social_star': 'people',
  'speed_demon': 'flash',
};

export const RewardsSystem: React.FC<RewardsSystemProps> = ({
  childId,
  onRewardEarned,
  onAchievementUnlocked,
}) => {
  const [stars, setStars] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationText, setCelebrationText] = useState('');
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [celebrationAnim] = useState(new Animated.Value(0));
  const [starAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadRewardsData();
  }, [childId]);

  const loadRewardsData = async () => {
    try {
      // Load stars
      const { data: starsData } = await supabase
        .from('child_stars')
        .select('total_stars')
        .eq('child_id', childId)
        .single();

      if (starsData) {
        setStars(starsData.total_stars);
      }

      // Load rewards
      const { data: rewardsData } = await supabase
        .from('child_rewards')
        .select('*')
        .eq('child_id', childId)
        .order('earned_at', { ascending: false });

      if (rewardsData) {
        setRewards(rewardsData);
      }

      // Load achievements
      const { data: achievementsData } = await supabase
        .from('child_achievements')
        .select('*')
        .eq('child_id', childId);

      if (achievementsData) {
        setAchievements(achievementsData);
      }
    } catch (error) {
      console.error('Error loading rewards data:', error);
    }
  };

  const awardStars = useCallback(async (count: number, reason: string) => {
    const newTotal = stars + count;
    setStars(newTotal);

    // Animate star
    Animated.sequence([
      Animated.timing(starAnim, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(starAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Update database
    await supabase
      .from('child_stars')
      .upsert({ child_id: childId, total_stars: newTotal });

    // Show celebration for significant star awards
    if (count >= 5) {
      triggerCelebration(`+${count} Stars! ${reason}`);
    }

    // Check for star milestones
    checkStarMilestones(newTotal);
  }, [stars, childId, starAnim]);

  const checkStarMilestones = async (totalStars: number) => {
    const milestones = [10, 25, 50, 100, 250, 500, 1000];
    
    for (const milestone of milestones) {
      if (totalStars >= milestone && !rewards.some(r => r.name === `${milestone} Stars!`)) {
        const reward: Reward = {
          id: `milestone_${milestone}`,
          type: 'badge',
          name: `${milestone} Stars!`,
          description: `Earned ${milestone} stars total`,
          earnedAt: new Date().toISOString(),
          icon: 'star',
          rarity: milestone >= 500 ? 'legendary' : milestone >= 100 ? 'epic' : milestone >= 50 ? 'rare' : 'common',
        };
        
        await saveReward(reward);
      }
    }
  };

  const saveReward = async (reward: Reward) => {
    await supabase.from('child_rewards').insert({
      child_id: childId,
      ...reward,
    });

    setRewards(prev => [reward, ...prev]);
    onRewardEarned?.(reward);
    triggerCelebration(`New Badge: ${reward.name}!`);
  };

  const checkAchievement = async (achievementId: string) => {
    const achievement = achievements.find(a => a.id === achievementId);
    if (!achievement || achievement.unlocked) return;

    const newProgress = achievement.progress + 1;
    const updatedAchievement = {
      ...achievement,
      progress: newProgress,
      unlocked: newProgress >= achievement.target,
      unlockedAt: newProgress >= achievement.target ? new Date().toISOString() : undefined,
    };

    // Update in database
    await supabase
      .from('child_achievements')
      .upsert({
        child_id: childId,
        ...updatedAchievement,
      });

    setAchievements(prev =>
      prev.map(a => (a.id === achievementId ? updatedAchievement : a))
    );

    if (updatedAchievement.unlocked) {
      onAchievementUnlocked?.(updatedAchievement);
      triggerCelebration(`Achievement Unlocked: ${achievement.name}!`);

      // Award bonus stars for achievement
      const bonusStars = achievement.requirement.type === 'streak_days' ? 10 : 5;
      await awardStars(bonusStars, 'Achievement Bonus');
    }
  };

  const recordActivityCompletion = async (
    activityType: string,
    score: number,
    perfect: boolean
  ) => {
    // Award base stars
    const baseStars = Math.floor(score / 20); // 0-5 stars based on score
    await awardStars(baseStars, 'Activity Complete');

    // Bonus stars for perfect score
    if (perfect) {
      await awardStars(3, 'Perfect Score Bonus');
      await checkAchievement('perfect_score');
    }

    // Check activity completion achievements
    await checkAchievement('first_activity');
  };

  const triggerCelebration = (text: string) => {
    setCelebrationText(text);
    setShowCelebration(true);

    celebrationAnim.setValue(0);
    Animated.sequence([
      Animated.spring(celebrationAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(celebrationAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setShowCelebration(false));
  };

  const getRarityColor = (rarity: Reward['rarity']): string => {
    switch (rarity) {
      case 'legendary': return '#FFD700';
      case 'epic': return '#9C27B0';
      case 'rare': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const renderStarCounter = () => (
    <TouchableOpacity
      style={styles.starCounter}
      onPress={() => setShowRewardsModal(true)}
    >
      <Animated.View style={{ transform: [{ scale: starAnim }] }}>
        <Ionicons name="star" size={28} color="#FFD700" />
      </Animated.View>
      <Text style={styles.starCount}>{stars}</Text>
    </TouchableOpacity>
  );

  const renderCelebration = () => {
    if (!showCelebration) return null;

    return (
      <Animated.View
        style={[
          styles.celebrationOverlay,
          {
            transform: [
              {
                scale: celebrationAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              },
            ],
            opacity: celebrationAnim,
          },
        ]}
      >
        <View style={styles.celebrationContent}>
          <Text style={styles.celebrationEmoji}>
            {CELEBRATION_EMOJIS[Math.floor(Math.random() * CELEBRATION_EMOJIS.length)]}
          </Text>
          <Text style={styles.celebrationText}>{celebrationText}</Text>
        </View>
      </Animated.View>
    );
  };

  const renderRewardsModal = () => (
    <Modal visible={showRewardsModal} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Rewards & Achievements</Text>
          <TouchableOpacity onPress={() => setShowRewardsModal(false)}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.starsBanner}>
          <Ionicons name="star" size={40} color="#FFD700" />
          <Text style={styles.starsBannerText}>{stars} Stars</Text>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.sectionTitle}>Recent Rewards</Text>
          {rewards.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="gift-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>Complete activities to earn rewards!</Text>
            </View>
          ) : (
            rewards.slice(0, 10).map(reward => (
              <View
                key={reward.id}
                style={[styles.rewardItem, { borderLeftColor: getRarityColor(reward.rarity) }]}
              >
                <View style={[styles.rewardIcon, { backgroundColor: getRarityColor(reward.rarity) + '20' }]}>
                  <Ionicons name={reward.icon as any} size={24} color={getRarityColor(reward.rarity)} />
                </View>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardName}>{reward.name}</Text>
                  <Text style={styles.rewardDescription}>{reward.description}</Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Achievements</Text>
          {achievements.map(achievement => (
            <View
              key={achievement.id}
              style={[styles.achievementItem, achievement.unlocked && styles.achievementUnlocked]}
            >
              <View style={[styles.achievementIcon, !achievement.unlocked && styles.achievementLocked]}>
                <Ionicons
                  name={BADGE_ICONS[achievement.id] as any || 'ribbon'}
                  size={24}
                  color={achievement.unlocked ? '#FFD700' : '#999'}
                />
              </View>
              <View style={styles.achievementInfo}>
                <Text style={[styles.achievementName, !achievement.unlocked && styles.achievementNameLocked]}>
                  {achievement.name}
                </Text>
                <Text style={styles.achievementDescription}>{achievement.description}</Text>
                <View style={styles.achievementProgress}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: ratioToPercent(achievement.progress, achievement.target) },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {achievement.progress}/{achievement.target}
                  </Text>
                </View>
              </View>
              {achievement.unlocked && (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <>
      {renderStarCounter()}
      {renderCelebration()}
      {renderRewardsModal()}
    </>
  );
};

const styles = StyleSheet.create({
  starCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9C4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  starCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F57C00',
    marginLeft: 4,
  },
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  },
  celebrationContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  celebrationEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  celebrationText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  starsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9C4',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  starsBannerText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F57C00',
    marginLeft: 12,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rewardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rewardDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  achievementUnlocked: {
    backgroundColor: '#FFFDE7',
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF9C4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementLocked: {
    backgroundColor: '#F5F5F5',
  },
  achievementInfo: {
    flex: 1,
    marginLeft: 12,
  },
  achievementName: {
    fontSize: 14,
    fontWeight: '600',
  },
  achievementNameLocked: {
    color: '#999',
  },
  achievementDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  achievementProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 8,
  },
});

export default RewardsSystem;

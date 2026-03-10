import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKidVoice } from '../../../hooks/useKidVoice';
import { ratioToPercent } from '../../../lib/progress/clampPercent';
import { DifficultyParameters } from '../AdaptiveDifficultyEngine';

const { width } = Dimensions.get('window');

interface AdditionActivityProps {
  difficulty: DifficultyParameters;
  onComplete: (result: AdditionResult) => void;
  onExit: () => void;
}

interface AdditionResult {
  correctAnswers: number;
  totalQuestions: number;
  timeSpent: number;
  score: number;
}

interface AdditionQuestion {
  num1: number;
  num2: number;
  answer: number;
  options: number[];
  visualObjects: string[];
}

const OBJECTS = ['🍎', '🍊', '🌟', '🟢', '🔵', '🟡', '🔴', '🟣'];

export const AdditionActivity: React.FC<AdditionActivityProps> = ({
  difficulty,
  onComplete,
  onExit,
}) => {
  const [currentQuestion, setCurrentQuestion] = useState<AdditionQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [startTime] = useState(Date.now());

  const { speak, stop } = useKidVoice();
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const objectAnim = useRef(new Animated.Value(0)).current;

  const maxNumber = 5 + (difficulty.questionCount > 8 ? 5 : 0);

  useEffect(() => {
    generateQuestion();
    return () => stop();
  }, []);

  const generateQuestion = useCallback(() => {
    const num1 = Math.floor(Math.random() * maxNumber) + 1;
    const num2 = Math.floor(Math.random() * maxNumber) + 1;
    const answer = num1 + num2;
    
    // Generate options including correct answer
    const options: number[] = [answer];
    while (options.length < 4) {
      const option = answer + Math.floor(Math.random() * 5) - 2;
      if (option > 0 && !options.includes(option)) {
        options.push(option);
      }
    }
    
    // Shuffle options
    options.sort(() => Math.random() - 0.5);

    const visualObject = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];

    const question: AdditionQuestion = {
      num1,
      num2,
      answer,
      options,
      visualObjects: Array(num1 + num2).fill(visualObject),
    };

    setCurrentQuestion(question);
    setSelectedAnswer(null);
    setShowResult(false);

    // Animate objects appearing
    objectAnim.setValue(0);
    Animated.stagger(50, [
      Animated.timing(objectAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    if (difficulty.audioSupport) {
      speak(`What is ${num1} plus ${num2}?`);
    }
  }, [maxNumber, difficulty.audioSupport, speak, objectAnim]);

  const handleAnswerPress = (answer: number) => {
    if (showResult) return;

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect = answer === currentQuestion?.answer;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      speak('Excellent! That is correct!');
      
      // Bounce animation
      Animated.sequence([
        Animated.spring(bounceAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      speak(`Not quite. The answer is ${currentQuestion?.answer}. Let's try the next one!`);
    }
  };

  const handleNext = () => {
    if (questionIndex + 1 >= difficulty.questionCount) {
      const timeSpent = Date.now() - startTime;
      const score = Math.round((correctAnswers / difficulty.questionCount) * 100);
      
      onComplete({
        correctAnswers,
        totalQuestions: difficulty.questionCount,
        timeSpent,
        score,
      });
    } else {
      setQuestionIndex(prev => prev + 1);
      generateQuestion();
    }
  };

  const renderVisualAid = () => {
    if (!difficulty.visualSupport || !currentQuestion) return null;

    const firstGroup = currentQuestion.visualObjects.slice(0, currentQuestion.num1);
    const secondGroup = currentQuestion.visualObjects.slice(currentQuestion.num1);

    return (
      <View style={styles.visualAidContainer}>
        <View style={styles.objectGroup}>
          <Text style={styles.groupLabel}>{currentQuestion.num1}</Text>
          <View style={styles.objectsRow}>
            {firstGroup.map((obj, idx) => (
              <Animated.Text
                key={`first-${idx}`}
                style={[
                  styles.objectEmoji,
                  {
                    opacity: objectAnim,
                    transform: [
                      {
                        scale: objectAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {obj}
              </Animated.Text>
            ))}
          </View>
        </View>
        
        <Text style={styles.plusSign}>+</Text>
        
        <View style={styles.objectGroup}>
          <Text style={styles.groupLabel}>{currentQuestion.num2}</Text>
          <View style={styles.objectsRow}>
            {secondGroup.map((obj, idx) => (
              <Animated.Text
                key={`second-${idx}`}
                style={[
                  styles.objectEmoji,
                  {
                    opacity: objectAnim,
                    transform: [
                      {
                        scale: objectAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {obj}
              </Animated.Text>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderOptions = () => {
    if (!currentQuestion) return null;

    return (
      <View style={styles.optionsGrid}>
        {currentQuestion.options.map((option, index) => {
          const isSelected = selectedAnswer === option;
          const isCorrect = option === currentQuestion.answer;
          
          let backgroundColor = '#FFF';
          let borderColor = '#E0E0E0';
          
          if (showResult) {
            if (isCorrect) {
              backgroundColor = '#E8F5E9';
              borderColor = '#4CAF50';
            } else if (isSelected && !isCorrect) {
              backgroundColor = '#FFEBEE';
              borderColor = '#F44336';
            }
          } else if (isSelected) {
            backgroundColor = '#E3F2FD';
            borderColor = '#1976D2';
          }

          return (
            <TouchableOpacity
              key={index}
              style={[styles.optionButton, { backgroundColor, borderColor }]}
              onPress={() => handleAnswerPress(option)}
              disabled={showResult}
              activeOpacity={0.8}
            >
              <Text style={styles.optionText}>{option}</Text>
              {showResult && isCorrect && (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" style={styles.optionIcon} />
              )}
              {showResult && isSelected && !isCorrect && (
                <Ionicons name="close-circle" size={24} color="#F44336" style={styles.optionIcon} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (!currentQuestion) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Ionicons name="close" size={28} color="#666" />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: ratioToPercent(questionIndex + 1, difficulty.questionCount) },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {questionIndex + 1} / {difficulty.questionCount}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <Animated.View style={{ transform: [{ scale: bounceAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.2],
        })}] }}>
          <Text style={styles.questionText}>
            What is {currentQuestion.num1} + {currentQuestion.num2}?
          </Text>
        </Animated.View>

        {renderVisualAid()}

        {renderOptions()}

        {showResult && (
          <View style={styles.resultContainer}>
            <Text style={[
              styles.resultText,
              { color: selectedAnswer === currentQuestion.answer ? '#4CAF50' : '#F44336' }
            ]}>
              {selectedAnswer === currentQuestion.answer
                ? '✓ Correct!'
                : `✗ The answer is ${currentQuestion.answer}`}
            </Text>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>
                {questionIndex + 1 >= difficulty.questionCount ? 'Finish' : 'Next'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.scoreContainer}>
          <Ionicons name="star" size={20} color="#FFD700" />
          <Text style={styles.scoreText}>{correctAnswers} correct</Text>
        </View>
        {difficulty.hintAvailability && !showResult && (
          <TouchableOpacity style={styles.hintButton} onPress={() => speak('Count all the objects together!')}>
            <Ionicons name="bulb-outline" size={20} color="#FF9800" />
            <Text style={styles.hintText}>Hint</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F5E9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
  },
  exitButton: {
    padding: 8,
  },
  progressContainer: {
    flex: 1,
    marginLeft: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#C8E6C9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
  },
  questionText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 24,
  },
  visualAidContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  objectGroup: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  groupLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  objectsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: width * 0.35,
  },
  objectEmoji: {
    fontSize: 32,
    margin: 2,
  },
  plusSign: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginHorizontal: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    maxWidth: width - 64,
  },
  optionButton: {
    width: (width - 96) / 2,
    height: 80,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  optionIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  resultContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  resultText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  nextButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreText: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF8E1',
  },
  hintText: {
    marginLeft: 6,
    color: '#FF9800',
    fontWeight: '600',
  },
});

export default AdditionActivity;

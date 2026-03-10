import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKidVoice } from '../../../hooks/useKidVoice';
import { ratioToPercent } from '../../../lib/progress/clampPercent';
import { AdaptiveDifficultyEngine, DifficultyParameters } from '../AdaptiveDifficultyEngine';

const { width } = Dimensions.get('window');

interface PhonicsActivityProps {
  letters: string[];
  difficulty: DifficultyParameters;
  onComplete: (result: PhonicsResult) => void;
  onExit: () => void;
}

interface PhonicsResult {
  correctAnswers: number;
  totalQuestions: number;
  timeSpent: number;
  score: number;
}

interface PhonicsQuestion {
  letter: string;
  sound: string;
  images: PhonicsImage[];
  correctImageIndex: number;
}

interface PhonicsImage {
  word: string;
  imageUrl: string;
  startsWithLetter: boolean;
}

const LETTER_SOUNDS: Record<string, string> = {
  'a': 'æ', 'b': 'b', 'c': 'k', 'd': 'd', 'e': 'e',
  'f': 'f', 'g': 'g', 'h': 'h', 'i': 'ɪ', 'j': 'dʒ',
  'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'o': 'o',
  'p': 'p', 'q': 'kw', 'r': 'r', 's': 's', 't': 't',
  'u': 'ʌ', 'v': 'v', 'w': 'w', 'x': 'ks', 'y': 'j', 'z': 'z',
};

const LETTER_WORDS: Record<string, string[]> = {
  'a': ['apple', 'ant', 'airplane', 'alligator', 'anchor'],
  'b': ['ball', 'bear', 'book', 'bird', 'boat'],
  'c': ['cat', 'car', 'cake', 'cup', 'cookie'],
  'd': ['dog', 'duck', 'door', 'drum', 'dolphin'],
  'e': ['egg', 'elephant', 'elf', 'envelope', 'eye'],
  'f': ['fish', 'frog', 'flower', 'fan', 'fox'],
  'g': ['goat', 'grape', 'gift', 'guitar', 'giraffe'],
  'h': ['hat', 'horse', 'house', 'hen', 'heart'],
  'i': ['igloo', 'insect', 'ice cream', 'island', 'ivy'],
  'j': ['jam', 'jet', 'jellyfish', 'juice', 'jacket'],
  'k': ['kite', 'key', 'king', 'kangaroo', 'kitten'],
  'l': ['lion', 'lamp', 'leaf', 'lemon', 'lollipop'],
  'm': ['moon', 'mouse', 'milk', 'monkey', 'mushroom'],
  'n': ['nose', 'nut', 'nest', 'nail', 'needle'],
  'o': ['orange', 'owl', 'octopus', 'ocean', 'onion'],
  'p': ['pig', 'pan', 'penguin', 'pizza', 'pencil'],
  'q': ['queen', 'question', 'quilt', 'quail', 'quarter'],
  'r': ['rabbit', 'rainbow', 'rose', 'robot', 'ring'],
  's': ['sun', 'star', 'snake', 'spider', 'sock'],
  't': ['tree', 'tiger', 'train', 'turtle', 'teddy'],
  'u': ['umbrella', 'unicorn', 'up', 'under', 'umpire'],
  'v': ['violin', 'van', 'vase', 'vest', 'volcano'],
  'w': ['water', 'whale', 'wagon', 'watch', 'window'],
  'x': ['xylophone', 'x-ray', 'fox', 'box', 'six'],
  'y': ['yarn', 'yogurt', 'yacht', 'yak', 'yellow'],
  'z': ['zebra', 'zipper', 'zoo', 'zero', 'zucchini'],
};

export const PhonicsActivity: React.FC<PhonicsActivityProps> = ({
  letters,
  difficulty,
  onComplete,
  onExit,
}) => {
  const [currentQuestion, setCurrentQuestion] = useState<PhonicsQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [startTime] = useState(Date.now());
  const [hintShown, setHintShown] = useState(false);

  const { speak, stop } = useKidVoice();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    generateQuestion();
    return () => stop();
  }, []);

  const generateQuestion = useCallback(() => {
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const words = LETTER_WORDS[letter] || [];
    
    // Get 2 correct words (start with letter) and 2 incorrect words
    const correctWords = words.slice(0, 2);
    const incorrectWords = Object.entries(LETTER_WORDS)
      .filter(([l]) => l !== letter)
      .flatMap(([, w]) => w)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const allWords = [...correctWords, ...incorrectWords].sort(() => Math.random() - 0.5);
    const correctIndex = allWords.findIndex(w => correctWords.includes(w));

    const question: PhonicsQuestion = {
      letter,
      sound: LETTER_SOUNDS[letter] || letter,
      images: allWords.slice(0, 4).map((word, idx) => ({
        word,
        imageUrl: `https://placehold.co/150x150/FFFFFF/333333?text=${word.charAt(0).toUpperCase() + word.slice(1)}`,
        startsWithLetter: word.startsWith(letter),
      })),
      correctImageIndex: correctIndex,
    };

    setCurrentQuestion(question);
    setSelectedImage(null);
    setShowResult(false);
    setHintShown(false);

    // Speak the letter sound
    if (difficulty.audioSupport) {
      speak(`Find the pictures that start with the ${letter} sound`);
    }
  }, [letters, difficulty.audioSupport, speak]);

  const handleImagePress = (index: number) => {
    if (showResult || selectedImage !== null) return;

    setSelectedImage(index);
    setShowResult(true);

    const isCorrect = currentQuestion?.images[index].startsWithLetter;
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      speak('Great job! That starts with the correct sound!');
    } else {
      speak(`Oops! That starts with a different sound. The correct answer was ${currentQuestion?.images[currentQuestion.correctImageIndex].word}`);
    }

    // Animate
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
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

  const handleHint = () => {
    if (difficulty.hintAvailability && !hintShown && currentQuestion) {
      setHintShown(true);
      speak(`Hint: The letter ${currentQuestion.letter} makes the ${currentQuestion.sound} sound. Look for pictures that start with this sound.`);
    }
  };

  const renderImage = (image: PhonicsImage, index: number) => {
    const isSelected = selectedImage === index;
    const isCorrect = image.startsWithLetter;

    let borderColor = '#E0E0E0';
    if (showResult && isSelected) {
      borderColor = isCorrect ? '#4CAF50' : '#F44336';
    } else if (showResult && isCorrect) {
      borderColor = '#4CAF50';
    }

    return (
      <TouchableOpacity
        key={index}
        style={[styles.imageCard, { borderColor }]}
        onPress={() => handleImagePress(index)}
        disabled={showResult}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: image.imageUrl }}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.imageLabel}>{image.word}</Text>
        {showResult && isCorrect && (
          <View style={styles.correctBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          </View>
        )}
        {showResult && isSelected && !isCorrect && (
          <View style={styles.wrongBadge}>
            <Ionicons name="close-circle" size={24} color="#F44336" />
          </View>
        )}
      </TouchableOpacity>
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

      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.letterDisplay}>{currentQuestion.letter.toUpperCase()}</Text>
        <Text style={styles.instruction}>
          Find the pictures that start with the{' '}
          <Text style={styles.letterHighlight}>{currentQuestion.letter}</Text> sound
        </Text>

        <View style={styles.imagesGrid}>
          {currentQuestion.images.map((image, index) => renderImage(image, index))}
        </View>

        {showResult && (
          <View style={styles.resultContainer}>
            <Text style={[
              styles.resultText,
              { color: currentQuestion.images[selectedImage!]?.startsWithLetter ? '#4CAF50' : '#F44336' }
            ]}>
              {currentQuestion.images[selectedImage!]?.startsWithLetter
                ? '✓ Correct!'
                : '✗ Try again next time!'}
            </Text>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>
                {questionIndex + 1 >= difficulty.questionCount ? 'Finish' : 'Next'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      <View style={styles.footer}>
        {difficulty.hintAvailability && !showResult && (
          <TouchableOpacity style={styles.hintButton} onPress={handleHint}>
            <Ionicons name="bulb-outline" size={20} color="#FF9800" />
            <Text style={styles.hintText}>Hint</Text>
          </TouchableOpacity>
        )}
        <View style={styles.scoreContainer}>
          <Ionicons name="star" size={20} color="#FFD700" />
          <Text style={styles.scoreText}>{correctAnswers} correct</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#BBDEFB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1976D2',
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
  letterDisplay: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 16,
  },
  instruction: {
    fontSize: 20,
    textAlign: 'center',
    color: '#333',
    marginBottom: 24,
  },
  letterHighlight: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  imageCard: {
    width: (width - 80) / 2,
    height: (width - 80) / 2 + 30,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '80%',
    height: '70%',
  },
  imageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  correctBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  wrongBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  resultContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  resultText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
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
});

export default PhonicsActivity;

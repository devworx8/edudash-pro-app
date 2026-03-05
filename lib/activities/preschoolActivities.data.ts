/**
 * Preschool Activities — Data
 *
 * 12 fun, interactive activities designed for 3–5 year olds.
 * Each activity has 5-6 rounds for longer engagement, is Dash-voiced,
 * and includes parent tips + AI follow-up handoff.
 *
 * Categories:
 *  - Numeracy (counting, patterns, size ordering)
 *  - Literacy (letters, rhyming, story building)
 *  - Science (colors, shapes, sounds)
 *  - Movement (gross motor, rhythm)
 *  - Cognitive (sorting, memory)
 */

import type { PreschoolActivity } from './preschoolActivities.types';

export const PRESCHOOL_ACTIVITIES: PreschoolActivity[] = [
  // ── NUMERACY ──────────────────────────────────────────────
  {
    id: 'emoji_farm_count',
    title: 'Farm Friends Count',
    subtitle: 'Count the animals on the farm!',
    emoji: '🐄',
    gameType: 'emoji_counting',
    domain: 'numeracy',
    ageRange: '3-5',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#059669', '#34D399'],
    skills: ['Counting 1-5', 'Number recognition', 'One-to-one correspondence'],
    learningObjective: 'Your child will practise counting objects up to 5 and matching quantities to numbers.',
    parentTip: 'After the activity, count real objects at home — spoons, toys, or shoes. Point to each one as you count together!',
    dashIntro: "Hey friend! Let's visit the farm and count the animals together! Are you ready?",
    dashCelebration: "Wow, you're a counting superstar! The farm animals are so happy you counted them!",
    rounds: [
      {
        id: 'r1',
        prompt: 'How many cows do you see?',
        emojiGrid: ['🐄', '🐄', '🐄'],
        options: [
          { id: 'a', label: '2', isCorrect: false },
          { id: 'b', label: '3', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '4', isCorrect: false },
        ],
        hint: 'Try pointing to each cow and counting — one, two...',
        celebration: 'Yes! Three moo-velous cows! 🐄🐄🐄',
      },
      {
        id: 'r2',
        prompt: 'How many chickens are pecking?',
        emojiGrid: ['🐔', '🐔', '🐔', '🐔', '🐔'],
        options: [
          { id: 'a', label: '4', isCorrect: false },
          { id: 'b', label: '5', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '6', isCorrect: false },
        ],
        hint: 'Count slowly — one, two, three...',
        celebration: 'Five clucky chickens! 🐔 Cluck cluck!',
      },
      {
        id: 'r3',
        prompt: 'How many piggies are in the mud?',
        emojiGrid: ['🐷', '🐷'],
        options: [
          { id: 'a', label: '1', isCorrect: false },
          { id: 'b', label: '2', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '3', isCorrect: false },
        ],
        hint: 'There are fewer this time — count carefully!',
        celebration: 'Two muddy piggies! oink oink! 🐷🐷',
      },
      {
        id: 'r4',
        prompt: 'How many sheep are sleeping?',
        emojiGrid: ['🐑', '🐑', '🐑', '🐑'],
        options: [
          { id: 'a', label: '3', isCorrect: false },
          { id: 'b', label: '4', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '5', isCorrect: false },
        ],
        hint: 'Count each fluffy sheep — one, two, three...',
        celebration: 'Four sleepy sheep! Baaaa! 🐑🐑🐑🐑',
      },
      {
        id: 'r5',
        prompt: 'How many ducks are swimming?',
        emojiGrid: ['🦆', '🦆', '🦆'],
        options: [
          { id: 'a', label: '2', isCorrect: false },
          { id: 'b', label: '3', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '4', isCorrect: false },
        ],
        hint: 'These birds love the water — count them up!',
        celebration: 'Three quacky ducks! 🦆 Quack quack quack!',
      },
      {
        id: 'r6',
        prompt: 'Now count ALL the farm animals out loud! Touch each one as you count. Tap Done when finished!',
        emojiGrid: [
          '🐄', '🐄', '🐄',
          '🐔', '🐔', '🐔', '🐔', '🐔',
          '🐷', '🐷',
          '🐑', '🐑', '🐑', '🐑',
          '🦆', '🦆', '🦆',
        ],
        confirmOnly: true,
        celebration: "Amazing counting! You're a real farm helper! 🌟🐄",
      },
    ],
    dashFollowUp: 'My child just completed a counting activity about farm animals. Can you ask them a fun follow-up counting question about animals?',
  },

  {
    id: 'pattern_train',
    title: 'Pattern Choo-Choo',
    subtitle: 'Complete the pattern to keep the train going!',
    emoji: '🚂',
    gameType: 'pattern_complete',
    domain: 'numeracy',
    ageRange: '4-5',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#D97706', '#FBBF24'],
    skills: ['Pattern recognition', 'Sequencing', 'Logical thinking'],
    learningObjective: 'Your child will recognise and extend simple AB and ABC patterns.',
    parentTip: 'Make patterns with real objects — red sock, blue sock, red sock... what comes next? Try with food at snack time too!',
    dashIntro: "All aboard the Pattern Train! Let's figure out what comes next. Choo choo!",
    dashCelebration: "The Pattern Train made it to the station! You're a pattern pro!",
    rounds: [
      {
        id: 'r1',
        prompt: '🔴🔵🔴🔵🔴 ... What comes next?',
        options: [
          { id: 'a', label: '🔵', emoji: '🔵', isCorrect: true },
          { id: 'b', label: '🔴', emoji: '🔴', isCorrect: false },
          { id: 'c', label: '🟢', emoji: '🟢', isCorrect: false },
        ],
        hint: 'Look at the pattern — red, blue, red, blue — what colour repeats?',
        celebration: 'Blue! The pattern keeps going! 🔴🔵🔴🔵🔴🔵',
      },
      {
        id: 'r2',
        prompt: '⭐🌙⭐🌙⭐ ... What comes next?',
        options: [
          { id: 'a', label: '⭐', emoji: '⭐', isCorrect: false },
          { id: 'b', label: '🌙', emoji: '🌙', isCorrect: true },
          { id: 'c', label: '☀️', emoji: '☀️', isCorrect: false },
        ],
        hint: 'Star, moon, star, moon, star... what follows the star?',
        celebration: 'Moon time! ⭐🌙 The night sky pattern!',
      },
      {
        id: 'r3',
        prompt: '🍎🍌🍇🍎🍌 ... What comes next?',
        options: [
          { id: 'a', label: '🍎', emoji: '🍎', isCorrect: false },
          { id: 'b', label: '🍌', emoji: '🍌', isCorrect: false },
          { id: 'c', label: '🍇', emoji: '🍇', isCorrect: true },
        ],
        hint: 'This one has THREE things repeating — apple, banana, grapes...',
        celebration: 'Grapes! You cracked the ABC pattern! 🍎🍌🍇',
      },
      {
        id: 'r4',
        prompt: '🟢🔵🟢🔵🟢🔵 ... What comes next?',
        options: [
          { id: 'a', label: '🟢', emoji: '🟢', isCorrect: true },
          { id: 'b', label: '🔵', emoji: '🔵', isCorrect: false },
          { id: 'c', label: '🔴', emoji: '🔴', isCorrect: false },
        ],
        hint: 'Green, blue, green, blue... the pattern keeps going!',
        celebration: 'Green! You see the pattern perfectly! 🟢🔵🟢',
      },
      {
        id: 'r5',
        prompt: 'Clap, stomp, clap, stomp, clap... What comes next? Do the action!',
        options: [
          { id: 'a', label: 'Clap! 👏', isCorrect: false },
          { id: 'b', label: 'Stomp! 🦶', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Jump! 🦘', isCorrect: false },
        ],
        hint: 'Clap, stomp, clap, stomp — it alternates!',
        celebration: 'Stomp! You made a body pattern! 👏🦶👏🦶',
      },
    ],
    requiresTier: null,
    dashFollowUp: 'My child just finished a pattern activity. Can you create a fun new pattern challenge with emojis?',
  },

  {
    id: 'size_safari',
    title: 'Size Safari',
    subtitle: 'Put the animals in order — small to big!',
    emoji: '🦁',
    gameType: 'size_order',
    domain: 'numeracy',
    ageRange: '3-4',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#B45309', '#F59E0B'],
    skills: ['Size comparison', 'Ordering', 'Vocabulary (big/small)'],
    learningObjective: 'Your child will compare sizes and arrange objects from smallest to biggest.',
    parentTip: 'Line up shoes from smallest to biggest at home. Talk about "smaller than" and "bigger than" during playtime.',
    dashIntro: 'Welcome to the Size Safari! Can you tell which animal is the biggest?',
    dashCelebration: "Safari complete! Now you know big, medium, and small — you're a size detective!",
    rounds: [
      {
        id: 'r1',
        prompt: 'Which animal is the BIGGEST?',
        emojiGrid: ['🐜', '🐕', '🐘'],
        options: [
          { id: 'a', label: 'Ant 🐜', isCorrect: false },
          { id: 'b', label: 'Dog 🐕', isCorrect: false },
          { id: 'c', label: 'Elephant 🐘', emoji: '⭐', isCorrect: true },
        ],
        hint: 'Think about which animal you could ride on!',
        celebration: 'The elephant! So big and strong! 🐘',
      },
      {
        id: 'r2',
        prompt: 'Which is the SMALLEST?',
        emojiGrid: ['🐛', '🐈', '🦒'],
        options: [
          { id: 'a', label: 'Caterpillar 🐛', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Cat 🐈', isCorrect: false },
          { id: 'c', label: 'Giraffe 🦒', isCorrect: false },
        ],
        hint: 'Which one could sit on your finger?',
        celebration: 'Tiny caterpillar! So small and wiggly! 🐛',
      },
      {
        id: 'r3',
        prompt: 'Which animal is the MEDIUM size? Not the biggest, not the smallest!',
        emojiGrid: ['🐁', '🐕', '🦒'],
        options: [
          { id: 'a', label: 'Mouse 🐁', isCorrect: false },
          { id: 'b', label: 'Dog 🐕', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Giraffe 🦒', isCorrect: false },
        ],
        hint: 'Medium means in the middle — not tiny, not huge!',
        celebration: 'The dog is medium! In between tiny and tall! 🐕',
      },
      {
        id: 'r4',
        prompt: 'Which fruit is BIGGER?',
        emojiGrid: ['🍓', '🍉'],
        options: [
          { id: 'a', label: 'Strawberry 🍓', isCorrect: false },
          { id: 'b', label: 'Watermelon 🍉', emoji: '⭐', isCorrect: true },
        ],
        hint: 'One of these needs two hands to carry!',
        celebration: 'Watermelon is way bigger! It\'s HUGE! 🍉',
      },
      {
        id: 'r5',
        prompt: 'Now line up your toys from smallest to biggest! Tap Done when you finish.',
        confirmOnly: true,
        celebration: 'What a great job sorting sizes! You\'re a size expert! 🌟',
      },
    ],
    dashFollowUp: 'My child just learned about sizes. Can you ask them a fun question about which is bigger or smaller?',
  },

  // ── LITERACY ──────────────────────────────────────────────
  {
    id: 'letter_friends',
    title: 'Letter Friends',
    subtitle: 'Find the letter that starts the word!',
    emoji: '🔤',
    gameType: 'letter_trace',
    domain: 'literacy',
    ageRange: '4-5',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#7C3AED', '#A78BFA'],
    skills: ['Letter recognition', 'Initial sounds', 'Phonics'],
    learningObjective: 'Your child will match letters to the beginning sounds of common words.',
    parentTip: 'Point out letters on signs, cereal boxes, and books. Ask "What sound does this letter make?" during daily routines.',
    dashIntro: "Let's play with letters! Each word starts with a special letter. Can you find it?",
    dashCelebration: "Letter champion! You know your ABCs so well!",
    rounds: [
      {
        id: 'r1',
        prompt: '🍎 Apple starts with which letter?',
        options: [
          { id: 'a', label: 'A', emoji: '🅰️', isCorrect: true },
          { id: 'b', label: 'B', isCorrect: false },
          { id: 'c', label: 'C', isCorrect: false },
        ],
        hint: 'Say "Apple" slowly — Aaa-pple. What sound do you hear first?',
        celebration: 'A for Apple! 🍎 Aaaa!',
      },
      {
        id: 'r2',
        prompt: '🐱 Cat starts with which letter?',
        options: [
          { id: 'a', label: 'D', isCorrect: false },
          { id: 'b', label: 'C', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'K', isCorrect: false },
        ],
        hint: 'Say "Cat" slowly — Ccc-at. Hear the first sound?',
        celebration: 'C for Cat! Meow! 🐱',
      },
      {
        id: 'r3',
        prompt: '🐸 Frog starts with which letter?',
        options: [
          { id: 'a', label: 'P', isCorrect: false },
          { id: 'b', label: 'R', isCorrect: false },
          { id: 'c', label: 'F', emoji: '⭐', isCorrect: true },
        ],
        hint: 'Ffff-rog — which letter makes the "ffff" sound?',
        celebration: 'F for Frog! Ribbit! 🐸',
      },
      {
        id: 'r4',
        prompt: '☀️ Sun starts with which letter?',
        options: [
          { id: 'a', label: 'S', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Z', isCorrect: false },
          { id: 'c', label: 'M', isCorrect: false },
        ],
        hint: 'Say "Sun" slowly — Sss-un. What\'s that first sound?',
        celebration: 'S for Sun! Sss! Shining bright! ☀️',
      },
      {
        id: 'r5',
        prompt: '🐶 Dog starts with which letter?',
        options: [
          { id: 'a', label: 'B', isCorrect: false },
          { id: 'b', label: 'D', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'G', isCorrect: false },
        ],
        hint: 'Ddd-og — which letter makes the "ddd" sound?',
        celebration: 'D for Dog! Woof woof! 🐶',
      },
      {
        id: 'r6',
        prompt: 'Now find something at home that starts with "B"! Say it out loud and tap Done.',
        confirmOnly: true,
        celebration: "Brilliant! B words are everywhere! You're a letter champion! 🌟",
      },
    ],
    dashFollowUp: 'My child just practised letter sounds. Can you play a fun phonics game with them?',
  },

  {
    id: 'rhyme_time',
    title: 'Rhyme Time',
    subtitle: 'Find the word that rhymes!',
    emoji: '🎵',
    gameType: 'rhyme_time',
    domain: 'literacy',
    ageRange: '4-5',
    difficulty: 'medium',
    durationMinutes: 5,
    gradient: ['#EC4899', '#F9A8D4'],
    skills: ['Phonological awareness', 'Rhyming', 'Listening'],
    learningObjective: 'Your child will identify words that rhyme (sound the same at the end).',
    parentTip: 'Sing nursery rhymes together and pause before the rhyming word — let your child guess! Try making up silly rhymes at bath time.',
    dashIntro: "Let's play Rhyme Time! Rhyming words sound the same at the end — like cat and hat! Ready?",
    dashCelebration: "You found all the rhymes! You're a rhythm and rhyme rockstar! 🎸",
    rounds: [
      {
        id: 'r1',
        prompt: 'Which word rhymes with CAT? 🐱',
        options: [
          { id: 'a', label: 'Dog 🐕', isCorrect: false },
          { id: 'b', label: 'Hat 🎩', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Cup ☕', isCorrect: false },
        ],
        hint: 'CAT... HAT... BAT — they all end with the same sound! Which one?',
        celebration: 'Hat! Cat and Hat both end with "at"! 🎩🐱',
      },
      {
        id: 'r2',
        prompt: 'Which word rhymes with TREE? 🌳',
        options: [
          { id: 'a', label: 'Bee 🐝', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Bird 🐦', isCorrect: false },
          { id: 'c', label: 'Fish 🐟', isCorrect: false },
        ],
        hint: 'Tree... free... bee — listen to the "ee" sound!',
        celebration: 'Bee! Tree and Bee both end with "ee"! 🌳🐝',
      },
      {
        id: 'r3',
        prompt: 'Which word rhymes with SUN? ☀️',
        options: [
          { id: 'a', label: 'Moon 🌙', isCorrect: false },
          { id: 'b', label: 'Star ⭐', isCorrect: false },
          { id: 'c', label: 'Fun 🎉', emoji: '⭐', isCorrect: true },
        ],
        hint: 'Sun... run... fun — they all sound alike at the end!',
        celebration: 'Fun! Sun and Fun — what a perfect pair! ☀️🎉',
      },
      {
        id: 'r4',
        prompt: 'Which word rhymes with CAKE? 🎂',
        options: [
          { id: 'a', label: 'Lake 🌊', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Cup ☕', isCorrect: false },
          { id: 'c', label: 'Ball ⚽', isCorrect: false },
        ],
        hint: 'Cake... bake... lake — listen for the "ake" sound!',
        celebration: 'Lake! Cake and Lake both end with "ake"! 🎂🌊',
      },
      {
        id: 'r5',
        prompt: 'Which word rhymes with RING? 💍',
        options: [
          { id: 'a', label: 'Door 🚨', isCorrect: false },
          { id: 'b', label: 'Sing 🎵', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Book 📚', isCorrect: false },
        ],
        hint: 'Ring... sing... king — they all end with "ing"!',
        celebration: 'Sing! Ring and Sing rhyme together! 💍🎵',
      },
    ],
    dashFollowUp: 'My child just played a rhyming game. Can you make up a silly rhyming poem with them?',
  },

  {
    id: 'story_adventure',
    title: 'Jungle Story Time',
    subtitle: 'Help Dash tell a story — you choose what happens!',
    emoji: '📖',
    gameType: 'story_builder',
    domain: 'literacy',
    ageRange: '3-5',
    difficulty: 'easy',
    durationMinutes: 7,
    gradient: ['#0891B2', '#67E8F9'],
    skills: ['Storytelling', 'Decision making', 'Vocabulary', 'Imagination'],
    learningObjective: 'Your child will build narrative thinking skills by choosing what happens next in a story.',
    parentTip: 'Retell the story at bedtime and let your child add new parts. Ask "What do you think happened next?" to build comprehension.',
    dashIntro: "Once upon a time, in a big green jungle... let's build a story together! You get to pick what happens!",
    dashCelebration: "What an amazing story! Maybe tonight you can tell Mummy or Daddy your jungle adventure!",
    rounds: [
      {
        id: 'r1',
        prompt: 'Dash was walking in the jungle and met an animal. Which animal did Dash meet?',
        options: [
          { id: 'a', label: 'A friendly monkey 🐒', emoji: '🐒', isCorrect: true },
          { id: 'b', label: 'A sleepy lion 🦁', emoji: '🦁', isCorrect: true },
          { id: 'c', label: 'A colourful parrot 🦜', emoji: '🦜', isCorrect: true },
        ],
        celebration: 'What a great choice! The adventure continues...',
      },
      {
        id: 'r2',
        prompt: 'The animal was looking for something. What was it?',
        options: [
          { id: 'a', label: 'A yummy banana 🍌', emoji: '🍌', isCorrect: true },
          { id: 'b', label: 'A shiny treasure 💎', emoji: '💎', isCorrect: true },
          { id: 'c', label: 'A lost friend 🐾', emoji: '🐾', isCorrect: true },
        ],
        celebration: 'Ooh, exciting! Let\'s keep going...',
      },
      {
        id: 'r3',
        prompt: 'Together they had to cross a river! How did they get across?',
        options: [
          { id: 'a', label: 'Swam across 🏊', emoji: '🏊', isCorrect: true },
          { id: 'b', label: 'Built a bridge 🌉', emoji: '🌉', isCorrect: true },
          { id: 'c', label: 'Rode a crocodile 🐊', emoji: '🐊', isCorrect: true },
        ],
        celebration: 'What a brave adventure!',
      },
      {
        id: 'r4',
        prompt: "They found what they were looking for! How did that make the animal feel?",
        options: [
          { id: 'a', label: 'SO happy! 🤩', emoji: '🤩', isCorrect: true },
          { id: 'b', label: 'Relieved and grateful 🥹', emoji: '🥹', isCorrect: true },
          { id: 'c', label: 'Excited and jumpy 🤸', emoji: '🤸', isCorrect: true },
        ],
        celebration: 'What a wonderful feeling! Happy endings are the best!',
      },
      {
        id: 'r5',
        prompt: 'Dash and the animal became best friends! What did they do to celebrate?',
        options: [
          { id: 'a', label: 'Had a big feast! 🍕', emoji: '🍕', isCorrect: true },
          { id: 'b', label: 'Danced under the stars! 🌙', emoji: '🌙', isCorrect: true },
          { id: 'c', label: 'Built a treehouse! 🌳', emoji: '🌳', isCorrect: true },
        ],
        celebration: 'What a perfect celebration! Best friends forever!',
      },
      {
        id: 'r6',
        prompt: 'Now tell the WHOLE story to your parent from the beginning! Tap Done when you finish.',
        confirmOnly: true,
        celebration: 'You are an incredible storyteller! The jungle is lucky to have you! 🌟📖',
      },
    ],
    dashFollowUp: 'My child just built a jungle story. Can you continue the adventure and ask them what happens next?',
  },

  // ── SCIENCE / DISCOVERY ───────────────────────────────────
  {
    id: 'rainbow_colours',
    title: 'Rainbow Colours',
    subtitle: 'Match the colour to something you know!',
    emoji: '🌈',
    gameType: 'color_match',
    domain: 'science',
    ageRange: '3-4',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#DC2626', '#FB923C'],
    skills: ['Colour recognition', 'Classification', 'Vocabulary'],
    learningObjective: 'Your child will identify and name primary colours and match them to everyday objects.',
    parentTip: 'Play "I Spy" with colours while shopping or on a walk. Let your child sort their crayons by colour.',
    dashIntro: "Let's paint a rainbow! Can you match the right colour? 🌈",
    dashCelebration: "You're a colour genius! Rainbow complete! 🌈✨",
    rounds: [
      {
        id: 'r1',
        prompt: 'What colour is a banana? 🍌',
        options: [
          { id: 'a', label: 'Red 🔴', isCorrect: false },
          { id: 'b', label: 'Yellow 🟡', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Blue 🔵', isCorrect: false },
        ],
        hint: 'Think about what a banana looks like — is it warm or cold coloured?',
        celebration: 'Yellow! Bananas are sunshine yellow! 🍌🟡',
      },
      {
        id: 'r2',
        prompt: 'What colour is the sky on a sunny day? ☀️',
        options: [
          { id: 'a', label: 'Green 🟢', isCorrect: false },
          { id: 'b', label: 'Blue 🔵', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Orange 🟠', isCorrect: false },
        ],
        hint: 'Look out the window on a nice day — what colour do you see up high?',
        celebration: "Blue sky! Beautiful blue! 🔵☀️",
      },
      {
        id: 'r3',
        prompt: 'What colour are leaves on a tree? 🌳',
        options: [
          { id: 'a', label: 'Green 🟢', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Purple 🟣', isCorrect: false },
          { id: 'c', label: 'White ⚪', isCorrect: false },
        ],
        hint: 'Trees have leaves that are the same colour as grass!',
        celebration: 'Green! Just like grass and avocados! 🌳🟢',
      },
      {
        id: 'r4',
        prompt: 'What colour is chocolate? 🍫',
        options: [
          { id: 'a', label: 'Pink 🟣', isCorrect: false },
          { id: 'b', label: 'Brown 🟤', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'White ⚪', isCorrect: false },
        ],
        hint: 'Think about what chocolate looks like — it\'s a warm, earthy colour!',
        celebration: 'Brown! Yummy brown chocolate! 🍫🟤',
      },
      {
        id: 'r5',
        prompt: 'What colour is a fire truck? 🚒',
        options: [
          { id: 'a', label: 'Red 🔴', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Blue 🔵', isCorrect: false },
          { id: 'c', label: 'Green 🟢', isCorrect: false },
        ],
        hint: 'Fire trucks are bright and shiny — a bold, warm colour!',
        celebration: 'Red! Nee-naw nee-naw! 🚒🔴',
      },
      {
        id: 'r6',
        prompt: 'Find something RED at home! Point to it and tap Done.',
        confirmOnly: true,
        celebration: "Great colour hunting! Colours are everywhere! 🌈🌟",
      },
    ],
    dashFollowUp: 'My child just learned about colours. Can you ask them what colour different things are?',
  },

  {
    id: 'shape_detective',
    title: 'Shape Detective',
    subtitle: 'Find shapes hiding everywhere!',
    emoji: '🔷',
    gameType: 'shape_hunt',
    domain: 'science',
    ageRange: '3-5',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#2563EB', '#60A5FA'],
    skills: ['Shape recognition', 'Spatial awareness', 'Observation'],
    learningObjective: 'Your child will identify basic 2D shapes and find them in real-world objects.',
    parentTip: 'Go on a shape hunt around the house — "The clock is a circle! The window is a rectangle!" Make it a daily game.',
    dashIntro: "Put on your detective hat! 🔍 Let's find shapes hiding in the world around us!",
    dashCelebration: "Case closed, detective! You found shapes everywhere! 🕵️‍♂️🔷",
    rounds: [
      {
        id: 'r1',
        prompt: 'A wheel is what shape? 🎡',
        options: [
          { id: 'a', label: 'Circle ⭕', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Square 🟥', isCorrect: false },
          { id: 'c', label: 'Triangle 🔺', isCorrect: false },
        ],
        hint: 'A wheel goes round and round — it has no corners!',
        celebration: 'Circle! Round and round it goes! ⭕🎡',
      },
      {
        id: 'r2',
        prompt: 'A slice of pizza looks like which shape? 🍕',
        options: [
          { id: 'a', label: 'Circle ⭕', isCorrect: false },
          { id: 'b', label: 'Triangle 🔺', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Star ⭐', isCorrect: false },
        ],
        hint: 'Pizza slices have a pointy tip and a wide end — three sides!',
        celebration: 'Triangle! Yummy triangle pizza! 🔺🍕',
      },
      {
        id: 'r3',
        prompt: 'A door is what shape?',
        options: [
          { id: 'a', label: 'Triangle 🔺', isCorrect: false },
          { id: 'b', label: 'Rectangle ▬', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Circle ⭕', isCorrect: false },
        ],
        hint: 'A door is tall and has four straight sides — two long and two short.',
        celebration: 'Rectangle! Like a tall box! 🚪',
      },
      {
        id: 'r4',
        prompt: 'A clock on the wall is what shape? ⏰',
        options: [
          { id: 'a', label: 'Square 🟥', isCorrect: false },
          { id: 'b', label: 'Circle ⭕', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Star ⭐', isCorrect: false },
        ],
        hint: 'Clocks go round and round, just like a wheel!',
        celebration: 'Circle! Tick tock goes the round clock! ⏰⭕',
      },
      {
        id: 'r5',
        prompt: 'How many sides does a triangle have? 🔺',
        options: [
          { id: 'a', label: '3 sides', emoji: '⭐', isCorrect: true },
          { id: 'b', label: '4 sides', isCorrect: false },
          { id: 'c', label: '2 sides', isCorrect: false },
        ],
        hint: 'Count each edge of the triangle — tri means three!',
        celebration: 'Three sides! Tri-angle = three angles! 🔺',
      },
      {
        id: 'r6',
        prompt: 'Go find a CIRCLE shape at home! Touch it and tap Done.',
        confirmOnly: true,
        celebration: "Amazing detective work! Shapes are everywhere! 🔍🌟",
      },
    ],
    dashFollowUp: 'My child just learned about shapes. Can you ask them to spot shapes around them?',
  },

  {
    id: 'animal_sounds',
    title: 'Who Says That?',
    subtitle: 'Match the animal to its sound!',
    emoji: '🐮',
    gameType: 'sound_match',
    domain: 'science',
    ageRange: '3-4',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#65A30D', '#A3E635'],
    skills: ['Listening', 'Animal knowledge', 'Matching'],
    learningObjective: 'Your child will connect animals to the sounds they make, building auditory matching skills.',
    parentTip: 'Play animal sound guessing games — make a sound and let your child guess the animal! Use picture books to reinforce.',
    dashIntro: "Shhh! Listen! The animals are calling! Can you guess who it is?",
    dashCelebration: "You know all the animal sounds! The animals are cheering for you! 🎉",
    rounds: [
      {
        id: 'r1',
        prompt: 'Which animal says "MOOO"? 🔊',
        options: [
          { id: 'a', label: 'Dog 🐕', isCorrect: false },
          { id: 'b', label: 'Cat 🐱', isCorrect: false },
          { id: 'c', label: 'Cow 🐄', emoji: '⭐', isCorrect: true },
        ],
        hint: 'This animal lives on a farm and gives us milk!',
        celebration: 'The cow says MOOO! 🐄',
      },
      {
        id: 'r2',
        prompt: 'Which animal says "WOOF WOOF"? 🔊',
        options: [
          { id: 'a', label: 'Dog 🐕', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Fish 🐟', isCorrect: false },
          { id: 'c', label: 'Frog 🐸', isCorrect: false },
        ],
        hint: 'This fluffy friend wags its tail when it\'s happy!',
        celebration: 'Woof woof! Good doggy! 🐕',
      },
      {
        id: 'r3',
        prompt: 'Which animal says "RIBBIT"? 🔊',
        options: [
          { id: 'a', label: 'Lion 🦁', isCorrect: false },
          { id: 'b', label: 'Frog 🐸', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Bird 🐦', isCorrect: false },
        ],
        hint: 'This little green friend lives near ponds and jumps really high!',
        celebration: 'Ribbit ribbit! The frog! 🐸',
      },
      {
        id: 'r4',
        prompt: 'Which animal says "BAAA"? 🔊',
        options: [
          { id: 'a', label: 'Sheep 🐑', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Horse 🐎', isCorrect: false },
          { id: 'c', label: 'Pig 🐷', isCorrect: false },
        ],
        hint: 'This fluffy animal lives on a farm and gives us wool!',
        celebration: 'Baaaa! The sheep! So fluffy! 🐑',
      },
      {
        id: 'r5',
        prompt: 'Which animal says "ROAR"? 🔊',
        options: [
          { id: 'a', label: 'Rabbit 🐰', isCorrect: false },
          { id: 'b', label: 'Lion 🦁', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Duck 🦆', isCorrect: false },
        ],
        hint: 'This big cat is the king of the jungle!',
        celebration: 'ROAR! The mighty lion! 🦁👑',
      },
      {
        id: 'r6',
        prompt: 'Make your FAVOURITE animal sound! Then tap Done.',
        confirmOnly: true,
        celebration: "What a fantastic sound! You're a real animal expert! 🐾🌟",
      },
    ],
    dashFollowUp: 'My child just matched animals to their sounds. Can you play a fun animal quiz with them?',
  },

  // ── CREATIVE / MOVEMENT ───────────────────────────────────
  {
    id: 'dance_freeze',
    title: 'Dance & Freeze!',
    subtitle: 'Move your body and FREEZE when Dash says stop!',
    emoji: '💃',
    gameType: 'body_move',
    domain: 'gross_motor',
    ageRange: '3-5',
    difficulty: 'easy',
    durationMinutes: 7,
    gradient: ['#E11D48', '#FB7185'],
    skills: ['Gross motor skills', 'Listening', 'Self-regulation', 'Rhythm'],
    learningObjective: 'Your child will practise bodily control, listening skills, and following instructions through movement.',
    parentTip: 'Play freeze-dance with music at home! It helps develop impulse control — a key school-readiness skill.',
    dashIntro: "Time to MOVE! Follow what I say, and when I say FREEZE — you stop like a statue! Ready? Let's go!",
    dashCelebration: 'What a dancer! You moved and froze perfectly! Your body is so clever! 💃🕺',
    rounds: [
      {
        id: 'r1',
        prompt: 'Jump like a bunny! 🐰 Hop hop hop!',
        movements: [
          { instruction: 'Jump up and down 5 times!', emoji: '🐰', durationSeconds: 10 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: 'Hop hop hop! Great jumping! 🐰',
      },
      {
        id: 'r2',
        prompt: 'Stretch up tall like a giraffe! 🦒',
        movements: [
          { instruction: 'Reach your hands as high as you can!', emoji: '🦒', durationSeconds: 8 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: 'So tall! You touched the sky! 🦒',
      },
      {
        id: 'r3',
        prompt: 'Walk SLOWLY like a turtle 🐢 then FREEZE!',
        movements: [
          { instruction: 'Walk super slowly then stop completely!', emoji: '🐢', durationSeconds: 12 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: 'FREEZE! What a great statue! 🗽',
      },
      {
        id: 'r4',
        prompt: 'Stomp like a BIG elephant! 🐘 Boom boom boom!',
        movements: [
          { instruction: 'Stomp your feet heavily — BIG steps!', emoji: '🐘', durationSeconds: 10 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: 'BOOM BOOM BOOM! What a powerful elephant! 🐘',
      },
      {
        id: 'r5',
        prompt: 'Spin around like a ballerina! 🩰 Then FREEZE!',
        movements: [
          { instruction: 'Spin around slowly with arms out wide!', emoji: '🩰', durationSeconds: 8 },
          { instruction: 'FREEZE like a statue!', emoji: '🧑‍🏭', durationSeconds: 5 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: 'Beautiful spinning and PERFECT freeze! 🩰❄️',
      },
      {
        id: 'r6',
        prompt: 'Do a silly dance for 10 seconds! 💃 Then take a big deep breath.',
        movements: [
          { instruction: 'Wiggle, spin, and dance!', emoji: '💃', durationSeconds: 10 },
          { instruction: 'Now breathe in... and out...', emoji: '🧘', durationSeconds: 5 },
        ],
        confirmOnly: true,
        timedConfirm: true,
        celebration: "Amazing dancing! You've got the best moves! 🌟💃",
      },
    ],
    dashFollowUp: 'My child just did a dance and freeze activity. Can you lead them in another fun movement game?',
  },

  {
    id: 'sorting_market',
    title: 'Market Sorting',
    subtitle: 'Help sort the market items!',
    emoji: '🛒',
    gameType: 'sorting_fun',
    domain: 'cognitive',
    ageRange: '3-5',
    difficulty: 'medium',
    durationMinutes: 6,
    gradient: ['#0D9488', '#5EEAD4'],
    skills: ['Classification', 'Categorization', 'Critical thinking'],
    learningObjective: 'Your child will sort objects into groups based on shared features.',
    parentTip: 'Sort laundry together by colour or type! In the kitchen, sort fruits vs vegetables. Ask "Why do these go together?"',
    dashIntro: "The market is messy! Can you help sort everything into the right place? Let's tidy up!",
    dashCelebration: 'The market looks perfect now! You sorted everything like a champ! 🛒✨',
    requiresTier: 'starter',
    rounds: [
      {
        id: 'r1',
        prompt: 'Which one is a FRUIT? 🍎',
        emojiGrid: ['🍎', '🥕', '🧁', '🍌'],
        options: [
          { id: 'a', label: 'Carrot 🥕', isCorrect: false },
          { id: 'b', label: 'Apple 🍎 & Banana 🍌', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Cupcake 🧁', isCorrect: false },
        ],
        hint: 'Fruits grow on trees and are sweet! Which ones grow on trees?',
        celebration: 'Apple and banana are fruits! They grow on trees! 🍎🍌',
      },
      {
        id: 'r2',
        prompt: 'Which ones can you WEAR? 👕',
        emojiGrid: ['👕', '🍕', '👟', '📚'],
        options: [
          { id: 'a', label: 'T-shirt 👕 & Shoes 👟', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Pizza 🍕', isCorrect: false },
          { id: 'c', label: 'Book 📚', isCorrect: false },
        ],
        hint: 'What do you put on your body every morning?',
        celebration: 'T-shirt and shoes are clothes! You wear them! 👕👟',
      },
      {
        id: 'r3',
        prompt: 'Which ones are ANIMALS? 🐾',
        emojiGrid: ['🌻', '🐕', '🐱', '🚗'],
        options: [
          { id: 'a', label: 'Flower 🌻', isCorrect: false },
          { id: 'b', label: 'Dog 🐕 & Cat 🐱', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Car 🚗', isCorrect: false },
        ],
        hint: 'Animals are alive, they breathe and move!',
        celebration: 'Dog and cat are animals! Furry friends! 🐕🐱',
      },
      {
        id: 'r4',
        prompt: 'Which ones are FOOD you can eat? 🍽️',
        emojiGrid: ['🍕', '👟', '🍎', '📚'],
        options: [
          { id: 'a', label: 'Pizza 🍕 & Apple 🍎', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Shoe 👟', isCorrect: false },
          { id: 'c', label: 'Book 📚', isCorrect: false },
        ],
        hint: 'Which ones can you put in your tummy?',
        celebration: 'Pizza and apple are food! Yummy! 🍕🍎',
      },
      {
        id: 'r5',
        prompt: 'Which ones are HOT? 🔥',
        emojiGrid: ['☀️', '❄️', '🔥', '🌨️'],
        options: [
          { id: 'a', label: 'Sun ☀️ & Fire 🔥', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Snowflake ❄️', isCorrect: false },
          { id: 'c', label: 'Cloud 🌨️', isCorrect: false },
        ],
        hint: 'Which ones would make you feel warm?',
        celebration: 'Sun and fire are hot! Don\'t touch! ☀️🔥',
      },
    ],
    dashFollowUp: 'My child just practised sorting items. Can you ask them to sort some new things into groups?',
  },

  {
    id: 'memory_ocean',
    title: 'Ocean Memory',
    subtitle: 'Find the matching sea creatures!',
    emoji: '🐙',
    gameType: 'memory_flip',
    domain: 'cognitive',
    ageRange: '4-5',
    difficulty: 'tricky',
    durationMinutes: 6,
    gradient: ['#1D4ED8', '#818CF8'],
    skills: ['Visual memory', 'Concentration', 'Matching'],
    learningObjective: 'Your child will exercise working memory by remembering card positions and finding pairs.',
    parentTip: 'Play memory games with real cards or socks! Start with 4 pairs and increase. Memory is a muscle — the more you play, the stronger it gets!',
    dashIntro: "Dive into the ocean! Can you find the matching sea creatures? Flip two cards and try to remember where they are!",
    dashCelebration: 'You found all the pairs! What an incredible memory! Your brain is super strong! 🧠🌊',
    requiresTier: 'starter',
    rounds: [
      {
        id: 'r1',
        prompt: 'Flip the cards and find the matching sea creatures! 🌊',
        memoryPairs: [
          { emoji: '🐙' },
          { emoji: '🐠' },
          { emoji: '🐬' },
          { emoji: '🦀' },
        ],
        celebration: 'Amazing! You found all the ocean pairs! 🌊🎉',
      },
      {
        id: 'r2',
        prompt: 'How many sea creatures were there?',
        options: [
          { id: 'a', label: '3', isCorrect: false },
          { id: 'b', label: '4', emoji: '⭐', isCorrect: true },
          { id: 'c', label: '5', isCorrect: false },
        ],
        hint: 'Think back — 🐙🐠🐬🦀 — count them!',
        celebration: 'Four sea creatures! Great counting and memory! 🌊',
      },
      {
        id: 'r3',
        prompt: 'Now try with MORE creatures! 🐳',
        memoryPairs: [
          { emoji: '🐙' },
          { emoji: '🐠' },
          { emoji: '🐬' },
          { emoji: '🦀' },
          { emoji: '🐳' },
          { emoji: '🦈' },
        ],
        celebration: 'Incredible memory! Six pairs found! 🧠✨',
      },
      {
        id: 'r4',
        prompt: 'Close your eyes and name all the sea creatures to your parent! Then tap Done.',
        confirmOnly: true,
        celebration: 'Amazing ocean explorer! Your memory is incredible! 🌊🐙🌟',
      },
    ],
    dashFollowUp: 'My child just played a memory matching game. Can you play another memory game or brain challenge with them?',
  },

  // ── SOCIAL EMOTIONAL ──────────────────────────────────────
  {
    id: 'feelings_faces',
    title: 'Feelings Faces',
    subtitle: 'Match the face to the feeling!',
    emoji: '😊',
    gameType: 'emotion_match',
    domain: 'social_emotional',
    ageRange: '3-5',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#F59E0B', '#FBBF24'],
    skills: ['Emotional recognition', 'Empathy', 'Vocabulary (feelings)'],
    learningObjective: 'Your child will identify and name basic emotions by matching facial expressions to feelings.',
    parentTip: 'At bedtime, ask "How did you feel today?" and name the emotion together. Use picture books that show different emotions.',
    dashIntro: "Let's learn about feelings! Can you tell how each face is feeling? Ready?",
    dashCelebration: "You're a feelings expert! Understanding emotions makes you a great friend! 💛",
    rounds: [
      {
        id: 'r1',
        prompt: '😊 How is this face feeling?',
        options: [
          { id: 'a', label: 'Happy 😊', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Sad 😢', isCorrect: false },
          { id: 'c', label: 'Angry 😠', isCorrect: false },
        ],
        hint: 'This face has a big smile! When do YOU smile like that?',
        celebration: 'Happy! That big smile means feeling great! 😊💛',
      },
      {
        id: 'r2',
        prompt: '😢 How is this face feeling?',
        options: [
          { id: 'a', label: 'Excited 🤩', isCorrect: false },
          { id: 'b', label: 'Sad 😢', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Sleepy 😴', isCorrect: false },
        ],
        hint: 'This face has tears. What makes YOU feel like crying?',
        celebration: "Sad. It's okay to feel sad sometimes. A hug can help! 😢🤗",
      },
      {
        id: 'r3',
        prompt: '😠 How is this face feeling?',
        options: [
          { id: 'a', label: 'Happy 😊', isCorrect: false },
          { id: 'b', label: 'Scared 😨', isCorrect: false },
          { id: 'c', label: 'Angry 😠', emoji: '⭐', isCorrect: true },
        ],
        hint: 'This face has a frown and tight eyebrows. What does that mean?',
        celebration: 'Angry! When we feel angry, we can take deep breaths. 😠➡️😌',
      },
      {
        id: 'r4',
        prompt: '😨 How is this face feeling?',
        options: [
          { id: 'a', label: 'Scared 😨', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'Silly 🤪', isCorrect: false },
          { id: 'c', label: 'Bored 😑', isCorrect: false },
        ],
        hint: 'This face has wide eyes and an open mouth — like seeing something surprising!',
        celebration: "Scared! When we're scared, we can hold someone's hand. 😨🤝",
      },
      {
        id: 'r5',
        prompt: '🤩 How is this face feeling?',
        options: [
          { id: 'a', label: 'Sad 😢', isCorrect: false },
          { id: 'b', label: 'Excited 🤩', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Tired 😫', isCorrect: false },
        ],
        hint: 'Star eyes! This face looks SUPER thrilled about something!',
        celebration: 'Excited! Star eyes means something amazing is happening! 🤩🌟',
      },
      {
        id: 'r6',
        prompt: 'Show YOUR parent a happy face, a sad face, and a silly face! Tap Done when finished.',
        confirmOnly: true,
        celebration: "You're a feelings superstar! Understanding feelings helps us be kind! 💛🌟",
      },
    ],
    dashFollowUp: 'My child just learned about emotions. Can you ask them about different feelings and when they experience them?',
  },

  // ── FINE MOTOR ─────────────────────────────────────────────
  {
    id: 'finger_path',
    title: 'Finger Path',
    subtitle: 'Follow the path with your finger!',
    emoji: '✋',
    gameType: 'pattern_complete',
    domain: 'fine_motor',
    ageRange: '3-4',
    difficulty: 'easy',
    durationMinutes: 5,
    gradient: ['#8B5CF6', '#C4B5FD'],
    skills: ['Fine motor control', 'Hand-eye coordination', 'Focus'],
    learningObjective: 'Your child will practise fine motor control by following directional patterns on screen.',
    parentTip: 'Let your child trace shapes in sand, playdough, or shaving cream. Drawing lines and circles strengthens the muscles needed for writing!',
    dashIntro: "Let's exercise our fingers! Follow the path and trace the shapes. Ready, steady, go!",
    dashCelebration: "Your fingers are SO clever! You're getting ready for writing! ✋✨",
    rounds: [
      {
        id: 'r1',
        prompt: 'Use your finger to draw a CIRCLE in the air! ⭕ Then tap Done.',
        confirmOnly: true,
        celebration: 'Beautiful circle! Round and round! ⭕',
      },
      {
        id: 'r2',
        prompt: 'Which direction does a clock\'s hand go? ⏰',
        emojiGrid: ['⏰'],
        options: [
          { id: 'a', label: 'Left ⬅️', isCorrect: false },
          { id: 'b', label: 'Round and round ➡️', emoji: '⭐', isCorrect: true },
          { id: 'c', label: 'Up and down ⬆️', isCorrect: false },
        ],
        hint: 'Watch a clock — the hands go around in one direction!',
        celebration: 'Clockwise! Round and round to the right! ⏰➡️',
      },
      {
        id: 'r3',
        prompt: 'Trace a zigzag line with your finger! ⚡ Like lightning! Then tap Done.',
        confirmOnly: true,
        celebration: 'ZAP! What a great zigzag! ⚡',
      },
      {
        id: 'r4',
        prompt: 'Can you draw the letter S in the air with your finger? 🐍 Then tap Done.',
        confirmOnly: true,
        celebration: 'Sssssuper S! Like a slithering snake! 🐍',
      },
      {
        id: 'r5',
        prompt: 'Touch each star from left to right! ⭐',
        emojiGrid: ['⭐', '⭐', '⭐', '⭐', '⭐'],
        options: [
          { id: 'a', label: 'I touched them all! ⭐', emoji: '⭐', isCorrect: true },
          { id: 'b', label: 'I missed some', isCorrect: true },
        ],
        celebration: 'Great finger control! Left to right, just like reading! ⭐➡️',
      },
    ],
    dashFollowUp: 'My child just did fine motor exercises. Can you give them a fun drawing or tracing challenge?',
  },
];

/** Get activities filtered by domain */
export const getActivitiesByDomain = (domain: string): PreschoolActivity[] =>
  PRESCHOOL_ACTIVITIES.filter(a => a.domain === domain);

/** Get activities suitable for an age */
export const getActivitiesForAge = (ageYears: number): PreschoolActivity[] =>
  PRESCHOOL_ACTIVITIES.filter(a => {
    const [min, max] = a.ageRange.split('-').map(Number);
    return ageYears >= min && ageYears <= max;
  });

/** Get activity by ID */
export const getActivityById = (id: string): PreschoolActivity | undefined =>
  PRESCHOOL_ACTIVITIES.find(a => a.id === id);

/** Group activities by domain for display */
export const getActivitiesGroupedByDomain = (): Record<string, PreschoolActivity[]> => {
  const grouped: Record<string, PreschoolActivity[]> = {};
  for (const activity of PRESCHOOL_ACTIVITIES) {
    if (!grouped[activity.domain]) grouped[activity.domain] = [];
    grouped[activity.domain].push(activity);
  }
  return grouped;
};

/** Domain display labels & emojis */
export const DOMAIN_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  numeracy: { label: 'Numbers & Patterns', emoji: '🔢', color: '#059669' },
  literacy: { label: 'Letters & Stories', emoji: '📖', color: '#7C3AED' },
  science: { label: 'Discover & Explore', emoji: '🔬', color: '#2563EB' },
  creative_arts: { label: 'Create & Imagine', emoji: '🎨', color: '#EC4899' },
  gross_motor: { label: 'Move & Play', emoji: '💃', color: '#E11D48' },
  cognitive: { label: 'Think & Solve', emoji: '🧠', color: '#0D9488' },
  social_emotional: { label: 'Feelings & Friends', emoji: '💛', color: '#F59E0B' },
  fine_motor: { label: 'Hands & Fingers', emoji: '✋', color: '#8B5CF6' },
};

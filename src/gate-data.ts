import type { GradeInput, Verdict } from './grade';

export interface GateCard {
  id: string;
  question: string;
  referenceAnswer: string;
  keyPoints: string[];
}

export interface LabelledAnswer {
  id: string;
  cardId: string;
  expected: Verdict;
  answer: string;
}

export const GATE_CARDS: readonly GateCard[] = [
  {
    id: 'photosynthesis',
    question: 'What does photosynthesis do, and where does it happen?',
    referenceAnswer:
      'Photosynthesis uses light energy, water and carbon dioxide to make glucose and release oxygen. It happens in the chloroplasts of plant cells.',
    keyPoints: [
      'Uses light energy, water and carbon dioxide',
      'Produces glucose and releases oxygen',
      'Happens in chloroplasts',
    ],
  },
  {
    id: 'binary-search',
    question: 'How does binary search find a value, and what is its time complexity?',
    referenceAnswer:
      'Binary search works on a sorted array. It compares the target with the middle element and discards half of the array each step. It runs in O(log n) time.',
    keyPoints: [
      'Requires a sorted array',
      'Compares with the middle element and discards half each step',
      'Runs in O(log n) time',
    ],
  },
  {
    id: 'opportunity-cost',
    question: 'What is opportunity cost?',
    referenceAnswer:
      'Opportunity cost is the value of the next best alternative you give up when you make a choice. Every choice with limited resources has one.',
    keyPoints: [
      'The value of the next best alternative given up',
      'Arises from choosing under limited resources',
    ],
  },
  {
    id: 'mitosis',
    question: 'What is mitosis and what does it produce?',
    referenceAnswer:
      'Mitosis is cell division in which one cell copies its chromosomes and splits into two genetically identical daughter cells, used for growth and repair.',
    keyPoints: [
      'One cell divides into two daughter cells',
      'Daughter cells are genetically identical',
      'Used for growth and repair',
    ],
  },
];

/** 12 labelled answers: per card one correct, one partial, one clearly wrong. */
export const LABELLED_SET: readonly LabelledAnswer[] = [
  {
    id: 'photo-correct',
    cardId: 'photosynthesis',
    expected: 'correct',
    answer:
      'It turns sunlight, water and CO2 into glucose and gives off oxygen. This takes place inside chloroplasts.',
  },
  {
    id: 'photo-partial',
    cardId: 'photosynthesis',
    expected: 'partial',
    answer: 'Plants use sunlight to make sugar. I forgot the rest.',
  },
  {
    id: 'photo-wrong',
    cardId: 'photosynthesis',
    expected: 'missed',
    answer: 'Plants burn sugar for energy in the mitochondria and release carbon dioxide at night.',
  },
  {
    id: 'bsearch-correct',
    cardId: 'binary-search',
    expected: 'correct',
    answer:
      'On a sorted array you check the middle item and throw away the half that cannot contain the target, repeating until found. That is O(log n).',
  },
  {
    id: 'bsearch-partial',
    cardId: 'binary-search',
    expected: 'partial',
    answer: 'You look at the middle of the list and cut it in half each time.',
  },
  {
    id: 'bsearch-wrong',
    cardId: 'binary-search',
    expected: 'missed',
    answer: 'It checks every element one by one from the start, so it takes O(n squared) time.',
  },
  {
    id: 'oc-correct',
    cardId: 'opportunity-cost',
    expected: 'correct',
    answer:
      'It is what you lose by picking one option: the value of the best alternative you did not choose, because resources are limited.',
  },
  {
    id: 'oc-partial',
    cardId: 'opportunity-cost',
    expected: 'partial',
    answer: 'It is about the trade-offs of making a choice.',
  },
  {
    id: 'oc-wrong',
    cardId: 'opportunity-cost',
    expected: 'missed',
    answer: 'It is the amount of money you pay out of pocket to buy something.',
  },
  {
    id: 'mitosis-correct',
    cardId: 'mitosis',
    expected: 'correct',
    answer:
      'A cell duplicates its chromosomes and divides into two identical daughter cells, which the body uses to grow and to repair tissue.',
  },
  {
    id: 'mitosis-partial',
    cardId: 'mitosis',
    expected: 'partial',
    answer: 'One cell splits into two new cells.',
  },
  {
    id: 'mitosis-wrong',
    cardId: 'mitosis',
    expected: 'missed',
    answer: 'It makes four different sex cells with half the chromosomes, for reproduction.',
  },
];

export function cardById(id: string): GateCard {
  const card = GATE_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Unknown gate card: ${id}`);
  return card;
}

export function toGradeInput(item: LabelledAnswer): GradeInput {
  const card = cardById(item.cardId);
  return {
    question: card.question,
    referenceAnswer: card.referenceAnswer,
    keyPoints: [...card.keyPoints],
    studentAnswer: item.answer,
  };
}

/** The card and starting answer for the single-grade section. */
export const SAMPLE_CARD: GateCard = cardById('photosynthesis');
export const SAMPLE_ANSWER =
  'Plants use sunlight and water to make glucose, and they give off oxygen.';

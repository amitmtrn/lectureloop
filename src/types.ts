export interface Card {
  front: string;
  back: string;
}

export interface StudyPack {
  summary: string;
  keyTerms: string[];
  cards: Card[];
}

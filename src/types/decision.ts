export interface Decision {
  id: string;
  decisionNumber: number;
  title: string;
  date: string;
  status: 'adopted' | 'superseded' | 'reversed';
  decisionMaker: string;
  project: string;
  
  // Content
  decision: string;
  reasoning: string;
  considerations?: string;
  uncertainties?: string;
  reversibility?: string;
  wouldChangeIf?: string;
  
  // Metadata
  embedding?: number[]; // pgvector embedding
  relatedDecisions?: string[];
  tags?: string[];
}

export interface DecisionSearchResult {
  decision: Decision;
  similarity: number;
}

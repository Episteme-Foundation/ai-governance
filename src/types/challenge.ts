export interface Challenge {
  id: string;
  decisionId: string;
  project: string;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  
  // Challenge content
  argument: string;
  evidence?: string;
  
  // Response
  respondedBy?: string;
  respondedAt?: string;
  response?: string;
  outcome?: string;
}

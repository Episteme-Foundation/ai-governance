export interface WikiPage {
  path: string;
  title: string;
  content: string;
  lastModified: string;
  modifiedBy: string;
  summary: string;
}

export interface WikiDraft {
  id: string;
  project: string;
  type: 'new_page' | 'edit_page';
  pagePath: string;
  proposedContent: string;
  originalContent?: string; // for edits
  proposedBy: string;
  proposedAt: string;
  editSummary: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  feedback?: string;
}

export interface WikiLandingPage {
  overview: string;
  navigation: WikiNavSection[];
  keyPages: WikiKeyPage[];
}

export interface WikiNavSection {
  title: string;
  pages: WikiPageRef[];
}

export interface WikiPageRef {
  title: string;
  path: string;
}

export interface WikiKeyPage {
  title: string;
  path: string;
  description: string;
}

export interface WikiSearchResult {
  page: WikiPage;
  score: number;
  matchSnippet?: string;
}

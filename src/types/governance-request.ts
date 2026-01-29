export type TrustLevel = 'anonymous' | 'contributor' | 'authorized' | 'elevated';

export type Channel = 'github_webhook' | 'public_api' | 'contributor_api' | 'admin_cli';

export interface GovernanceRequest {
  id: string;
  timestamp: string;
  trust: TrustLevel;
  source: {
    channel: Channel;
    identity?: string;
    metadata?: Record<string, unknown>;
  };
  project: string;
  intent: string;
  payload: Record<string, unknown>;
}

export type CompetitionStatus = "draft" | "live" | "ended";
export type SeriesRange = "12h" | "1d" | "2d" | "3d" | "all";
export type ChartMetric = "equity" | "votes";

export interface CompetitionResponse {
  status: CompetitionStatus;
  title: string;
  startsAt: number | null;
  endsAt: number | null;
  votingEnabled: boolean;
  commentsEnabled: boolean;
  seasonId: string;
  upstreamBaseUrl?: string;
  lastSyncAt?: number | null;
}

export interface ContestantSummary {
  id: string;
  displayName: string;
  tagline: string;
  company?: string;
  avatarUrl: string | null;
  accentColor: string;
  sortOrder: number;
  equity: number;
  returnPct: number;
  rank: number;
  votes: number;
  totalPnl: number;
  sharpe: number;
  winRate: number;
}

export interface Position {
  symbol?: string;
  qty?: number | string;
  avg_entry_price?: number | string;
  side?: string;
  market_value?: number | string;
  unrealized_pl?: number | string;
  unrealized_plpc?: number | string;
  current_price?: number | string;
  [key: string]: unknown;
}

export interface ContestantDetail extends ContestantSummary {
  positions: Position[];
  metrics: Record<string, number | string | null>;
  account: Record<string, number | string | null>;
}

export interface ContestantsResponse {
  contestants: ContestantSummary[];
}

export interface Point {
  t: number;
}

export interface EquityPoint extends Point {
  equity: number;
}

export interface VotePoint extends Point {
  count: number;
}

export interface EquitySeriesResponse {
  series: Record<string, EquityPoint[]>;
}

export interface VoteSeriesResponse {
  series: Record<string, VotePoint[]>;
}

export interface VotesResponse {
  seasonId: string;
  totals: Record<string, number>;
}

export interface Decision {
  id: string;
  contestantId: string;
  symbol: string;
  action: string;
  qty: number;
  price: number;
  confidence: string | number | null;
  reasoning: string | null;
  justification: string | null;
  chainOfThought: string | null;
  timestamp: number;
}

export interface DecisionsResponse {
  decisions: Decision[];
  nextCursor: string | null;
}

export interface DecisionsByMinuteResponse {
  minutes: Array<{ minute: number; items: Decision[] }>;
  nextCursor: string | null;
}

export interface Comment {
  id: number;
  userId: string;
  displayName: string;
  text: string;
  mentions: string[];
  createdAt: number;
}

export interface CommentsResponse {
  comments: Comment[];
  nextCursor: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner?: boolean;
}

export interface VoteResponse {
  ok: true;
  total: number;
}

export interface CommentCreateResponse {
  ok: true;
  id: number;
  heartsAwarded: Record<string, number>;
}

export interface IngestResponse {
  ok: true;
  counts?: Record<string, number>;
}

export interface DailyResponse {
  days: Array<{ day: string; votes: number; equityClose: number | null; dEquity: number; dVotes: number }>;
}

export interface ManagedCompetitionResponse {
  competition: {
    id: string;
    title: string;
    status: CompetitionStatus;
    startsAt: number | null;
    endsAt: number | null;
    upstreamBaseUrl: string;
    votingEnabled: number;
    commentsEnabled: number;
    activeSeasonId: string;
    updatedAt: number;
    lastSyncAt?: number | null;
  };
}

export interface ManagedContestant {
  id: string;
  displayName: string;
  tagline: string;
  avatarS3Uri: string | null;
  accentColor: string;
  sortOrder: number;
  hidden: number;
  updatedAt: number;
}

export interface ManagedContestantsResponse {
  contestants: ManagedContestant[];
}

export interface ManagedCommentsResponse {
  comments: Array<Comment & { hidden?: number; seasonId?: string }>;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface ApiKeysResponse {
  keys: ApiKey[];
}

export interface SummaryVotesResponse {
  contestants: Array<{ id: string; displayName: string; total: number; days: Record<string, number> }>;
  days?: string[];
}

export interface SummaryEquityResponse {
  contestants: Array<{ id: string; displayName: string; equity: number; returnPct: number; days: Record<string, number> }>;
  days?: string[];
}

export interface CreateApiKeyResponse {
  key: ApiKey;
  plaintext: string;
}

export interface PresignAvatarResponse {
  url: string;
  key: string;
  requiredHeaders?: Record<string, string>;
}

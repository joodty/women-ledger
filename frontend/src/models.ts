export type Slot = "me" | "him";
export type Visibility = "private" | "shared";
export interface Member {
  id: Slot;
  name: string;
  avatar?: string | null;
  side?: string;
  role?: string;
}
export interface Category {
  id: string;
  name: string;
  desc?: string;
  color: string;
}
export interface Entry {
  id: string;
  memberId: Slot;
  date: string;
  start: string;
  end: string;
  minutes: number;
  content: string;
  note?: string;
  happy?: number | null;
  goalId?: string | null;
  categoryId?: string | null;
  visibility?: Visibility;
}
export interface Goal {
  id: string;
  memberId: Slot;
  name: string;
  kind?: "once" | "repeat";
  scope?: "me" | "both";
  joined?: boolean;
  visibility?: Visibility;
  status: "active" | "done" | "dropped";
  timesPerWeek?: number;
  pointsPerCheckin?: number;
  categoryId?: string;
  reminderTime?: string;
  keywords: string[];
}
export interface Wish {
  id: string;
  name: string;
  scope?: Slot | "both";
  executor?: Slot | "both";
  executorLabel?: string;
  pointsLabel: string;
  status?: string;
  icon?: string;
  cat?: string;
}
export interface Story {
  id: string;
  memberId: Slot;
  seq: number;
  date: string;
  text: string;
}
export interface Milestone {
  id: string;
  kind: string;
  date: string;
  title: string;
  note?: string;
  plan?: string;
}
export interface Points {
  id: string;
  memberId: Slot;
  points: number;
  wallet?: "mine" | "ours";
  date: string;
  note?: string;
  type: string;
  entryId?: string;
}
export interface Redemption {
  reverseRequestedBy?: Slot;
  reversedBy?: Slot;
  reversedAt?: string;
  id: string;
  memberId: Slot;
  name: string;
  date: string;
  status?: string;
  fromMe?: number;
  fromHim?: number;
  fromOurs?: number;
  wallet?: "mine" | "ours";
  wishId?: string;
  rewardId?: string;
}
export interface SpaceData {
  version: number;
  couple: { since: string; code?: string; shareOpen: boolean };
  members: Member[];
  categories: Category[];
  entries: Entry[];
  goals: Goal[];
  wishlist: Wish[];
  story_entries: Story[];
  milestones: Milestone[];
  points_ledger: Points[];
  redemptions: Redemption[];
  weekly_settlements: unknown[];
  sparks: string[];
}
export interface Session {
  account: string;
  slot: Slot;
  spaceId: string;
  canInvite: boolean;
  legacySpace?: boolean;
  members: { account: string; slot: Slot }[];
}
export interface Bootstrap {
  revision: number;
  data: SpaceData;
  versions: Record<string, Record<string, number>>;
  session: Session;
}
export interface Command {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
}
export interface Pending {
  account: string;
  spaceId: string;
  command: Command;
  label: string;
  status: "waiting" | "conflict" | "error";
  message?: string;
  details?: {
    collection: string;
    id: string;
    current: unknown;
    version: number;
  };
}

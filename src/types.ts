export type PondType = 'biofloc' | 'non-biofloc';

export interface FeedingSchedule {
  id: string;
  time: string; // HH:mm
  amount: number; // in grams
  enabled: boolean;
}

export interface PondStatus {
  id: string;
  name: string;
  type: PondType;
  fishCount: number;
  fishAge: number; // in days
  feedLevel: number; // percentage
  temperature: number;
  ph: number;
  battery: number;
  lastFeeding: string | null;
  schedules: FeedingSchedule[];
}

export interface FeedingLog {
  id: string;
  pondId: string;
  timestamp: string;
  amount: number;
  status: 'success' | 'failed';
}

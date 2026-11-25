// =============================================================
// 폭탄돌리기: 서버/화면이 함께 쓰는 상수와 타입
// =============================================================

export const ARENA_W = 960;
export const ARENA_H = 560;
export const PLAYER_R = 18;
export const SPEED = 240; // px/s
export const HOLDER_SPEED = 270; // 폭탄 든 사람은 조금 더 빠르게
export const ROUND_MS = 15_000;
export const COUNTDOWN_MS = 3_000;
export const BOOM_MS = 3_000;
export const PASS_COOLDOWN_MS = 800;
export const MAX_PLAYERS = 12;

export const PLAYER_COLORS = [
  "#7aa2f7", "#f7768e", "#9ece6a", "#e0af68", "#bb9af7", "#7dcfff",
  "#ff9e64", "#73daca", "#c0caf5", "#f4a3c4", "#b4f9a8", "#d7a65f",
];

export type BombStatus = "lobby" | "countdown" | "playing" | "boom" | "done";

export type BombPlayerView = {
  userId: number;
  nickname: string;
  x: number;
  y: number;
  alive: boolean;
  color: string;
  posVersion: number;
};

export type BombRoomView = {
  id: number;
  name: string;
  hostId: number;
  status: BombStatus;
  round: number;
  phaseEndsAt: number;
  bombHolder: number | null;
  lastExploded: number | null;
  winnerId: number | null;
  serverNow: number;
  players: BombPlayerView[];
};

export type BombRoomSummary = {
  id: number;
  name: string;
  status: BombStatus;
  playerCount: number;
  hostNickname: string;
};

// =============================================================
// 미니게임: 폭탄돌리기 (서버 메모리 상태)
// - 방/게임 상태는 DB가 아니라 서버 프로세스 메모리에 둔다. (next start 단일 프로세스 기준)
//   서버를 재시작하면 진행 중인 방은 사라진다.
// - 별도 타이머 없이, 요청이 들어올 때마다 advance()로 시간 기준 상태를 따라잡는다.
// - 규칙: 폭탄 든 사람이 다른 사람과 부딪히면 폭탄이 넘어간다. 라운드 15초가 끝나면
//   폭탄을 든 사람이 탈락하고, 마지막 1명이 남을 때까지 라운드를 반복한다.
// =============================================================

import {
  ARENA_H, ARENA_W, BOOM_MS, COUNTDOWN_MS, HOLDER_SPEED, MAX_PLAYERS, PASS_COOLDOWN_MS, PLAYER_COLORS, PLAYER_R, ROUND_MS, SPEED,
  type BombRoomSummary, type BombRoomView, type BombStatus,
} from "./bombGameShared";

export * from "./bombGameShared";

const LOBBY_STALE_MS = 15_000; // 대기실에서 응답이 끊긴 사람은 내보낸다
const ROOM_IDLE_MS = 10 * 60_000; // 아무도 요청하지 않는 방은 정리

type Player = {
  userId: number;
  nickname: string;
  x: number;
  y: number;
  alive: boolean;
  color: string;
  lastSeen: number;
  lastMoveAt: number;
  posVersion: number; // 서버가 위치를 강제로 옮길 때(리스폰) 올라간다
};

type Room = {
  id: number;
  name: string;
  hostId: number;
  status: BombStatus;
  players: Map<number, Player>;
  bombHolder: number | null;
  phaseEndsAt: number;
  round: number;
  lastPassAt: number;
  lastExploded: number | null;
  winnerId: number | null;
  updatedAt: number;
};

export class BombGameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// 개발 모드 HMR에서도 상태가 유지되도록 globalThis에 둔다.
type Store = { rooms: Map<number, Room>; nextId: number };
const g = globalThis as unknown as { __bombGameStore?: Store };
const store: Store = g.__bombGameStore ?? (g.__bombGameStore = { rooms: new Map(), nextId: 1 });

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const spawnPoint = (index: number, total: number) => {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: ARENA_W / 2 + Math.cos(angle) * ARENA_W * 0.32,
    y: ARENA_H / 2 + Math.sin(angle) * ARENA_H * 0.32,
  };
};

const respawn = (room: Room, onlyAlive: boolean) => {
  const targets = [...room.players.values()].filter(p => !onlyAlive || p.alive);
  targets.forEach((p, i) => {
    const pt = spawnPoint(i, targets.length);
    p.x = pt.x;
    p.y = pt.y;
    p.posVersion++;
  });
};

const alivePlayers = (room: Room) => [...room.players.values()].filter(p => p.alive);

const pickRandom = <T,>(items: T[]): T | null => (items.length ? items[Math.floor(Math.random() * items.length)] : null);

const startRound = (room: Room, startAt: number) => {
  room.round++;
  respawn(room, true);
  room.bombHolder = pickRandom(alivePlayers(room))?.userId ?? null;
  room.lastExploded = null;
  room.lastPassAt = 0;
  room.status = "countdown";
  room.phaseEndsAt = startAt + COUNTDOWN_MS;
};

const finishIfOneLeft = (room: Room, now: number) => {
  const alive = alivePlayers(room);
  if (alive.length > 1) return false;
  room.status = "done";
  room.winnerId = alive[0]?.userId ?? null;
  room.bombHolder = null;
  room.phaseEndsAt = now;
  return true;
};

// 시간이 지난 만큼 상태를 진행시킨다.
const advance = (room: Room, now: number) => {
  for (let guard = 0; guard < 50; guard++) {
    if (room.status === "lobby" || room.status === "done") break;
    if (now < room.phaseEndsAt) break;

    if (room.status === "countdown") {
      room.status = "playing";
      room.phaseEndsAt += ROUND_MS;
      continue;
    }
    if (room.status === "playing") {
      const holder = room.bombHolder !== null ? room.players.get(room.bombHolder) : undefined;
      if (holder) holder.alive = false;
      room.lastExploded = holder?.userId ?? null;
      room.bombHolder = null;
      const endedAt = room.phaseEndsAt;
      if (finishIfOneLeft(room, endedAt)) break;
      room.status = "boom";
      room.phaseEndsAt = endedAt + BOOM_MS;
      continue;
    }
    if (room.status === "boom") {
      startRound(room, room.phaseEndsAt);
      continue;
    }
  }
};

const cleanup = (now: number) => {
  for (const room of store.rooms.values()) {
    if (room.status === "lobby") {
      for (const p of room.players.values()) {
        if (now - p.lastSeen > LOBBY_STALE_MS) removePlayer(room, p.userId, now);
      }
    }
    if (room.players.size === 0 || now - room.updatedAt > ROOM_IDLE_MS) store.rooms.delete(room.id);
  }
};

const removePlayer = (room: Room, userId: number, now: number) => {
  if (!room.players.delete(userId)) return;
  if (room.hostId === userId) {
    const next = room.players.values().next().value as Player | undefined;
    if (next) room.hostId = next.userId;
  }
  if (room.status === "lobby" || room.status === "done") return;
  if (finishIfOneLeft(room, now)) return;
  if (room.bombHolder === userId) {
    room.bombHolder = pickRandom(alivePlayers(room))?.userId ?? null;
    room.lastPassAt = now;
  }
};

const nextColor = (room: Room) => {
  const used = new Set([...room.players.values()].map(p => p.color));
  return PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
};

const getRoom = (roomId: number) => {
  const room = store.rooms.get(roomId);
  if (!room) throw new BombGameError("방이 없어요.", 404);
  return room;
};

const toView = (room: Room, now: number): BombRoomView => ({
  id: room.id,
  name: room.name,
  hostId: room.hostId,
  status: room.status,
  round: room.round,
  phaseEndsAt: room.phaseEndsAt,
  bombHolder: room.bombHolder,
  lastExploded: room.lastExploded,
  winnerId: room.winnerId,
  serverNow: now,
  players: [...room.players.values()].map(({ userId, nickname, x, y, alive, color, posVersion }) => (
    { userId, nickname, x: Math.round(x), y: Math.round(y), alive, color, posVersion }
  )),
});

// 폭탄 든 사람과 부딪힌 사람 중 가장 가까운 사람에게 폭탄을 넘긴다.
const tryPass = (room: Room, now: number) => {
  if (room.status !== "playing" || room.bombHolder === null) return;
  if (now - room.lastPassAt < PASS_COOLDOWN_MS) return;
  const holder = room.players.get(room.bombHolder);
  if (!holder) return;
  let target: Player | null = null;
  let best = (PLAYER_R * 2) ** 2;
  for (const p of room.players.values()) {
    if (!p.alive || p.userId === holder.userId) continue;
    const d = (p.x - holder.x) ** 2 + (p.y - holder.y) ** 2;
    if (d <= best) { best = d; target = p; }
  }
  if (!target) return;
  room.bombHolder = target.userId;
  room.lastPassAt = now;
};

const leaveOtherRooms = (userId: number, keepRoomId: number | null, now: number) => {
  for (const room of store.rooms.values()) {
    if (room.id !== keepRoomId && room.players.has(userId)) {
      advance(room, now);
      removePlayer(room, userId, now);
      room.updatedAt = now;
    }
  }
};

// ------------------------------ 공개 함수 ------------------------------

export const listRooms = (): BombRoomSummary[] => {
  const now = Date.now();
  cleanup(now);
  return [...store.rooms.values()].map(room => {
    advance(room, now);
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      playerCount: room.players.size,
      hostNickname: room.players.get(room.hostId)?.nickname ?? "",
    };
  }).sort((a, b) => b.id - a.id);
};

export const createRoom = (user: { userId: number; nickname: string }, name: string): BombRoomView => {
  const now = Date.now();
  cleanup(now);
  leaveOtherRooms(user.userId, null, now);
  const room: Room = {
    id: store.nextId++,
    name: name.trim().slice(0, 30) || `${user.nickname}의 폭탄방`,
    hostId: user.userId,
    status: "lobby",
    players: new Map(),
    bombHolder: null,
    phaseEndsAt: now,
    round: 0,
    lastPassAt: 0,
    lastExploded: null,
    winnerId: null,
    updatedAt: now,
  };
  store.rooms.set(room.id, room);
  return joinRoom(user, room.id);
};

export const joinRoom = (user: { userId: number; nickname: string }, roomId: number): BombRoomView => {
  const now = Date.now();
  const room = getRoom(roomId);
  advance(room, now);
  leaveOtherRooms(user.userId, roomId, now);
  const existing = room.players.get(user.userId);
  if (existing) {
    existing.lastSeen = now;
    return toView(room, now);
  }
  if (room.status !== "lobby") throw new BombGameError("이미 게임이 시작된 방이에요. 끝날 때까지 기다려 주세요.", 409);
  if (room.players.size >= MAX_PLAYERS) throw new BombGameError(`방이 꽉 찼어요. (최대 ${MAX_PLAYERS}명)`, 409);
  const pt = spawnPoint(room.players.size, MAX_PLAYERS);
  room.players.set(user.userId, {
    userId: user.userId,
    nickname: user.nickname,
    x: pt.x,
    y: pt.y,
    alive: true,
    color: nextColor(room),
    lastSeen: now,
    lastMoveAt: now,
    posVersion: 1,
  });
  room.updatedAt = now;
  return toView(room, now);
};

export const leaveRoom = (userId: number, roomId: number) => {
  const now = Date.now();
  const room = store.rooms.get(roomId);
  if (!room) return;
  advance(room, now);
  removePlayer(room, userId, now);
  room.updatedAt = now;
  if (room.players.size === 0) store.rooms.delete(room.id);
};

export const startGame = (userId: number, roomId: number): BombRoomView => {
  const now = Date.now();
  const room = getRoom(roomId);
  advance(room, now);
  if (room.hostId !== userId) throw new BombGameError("방장만 시작할 수 있어요.", 403);
  if (room.status !== "lobby" && room.status !== "done") throw new BombGameError("이미 진행 중이에요.", 409);
  // 대기실에서 응답이 끊긴 사람은 빼고 시작한다.
  for (const p of room.players.values()) {
    if (p.userId !== userId && now - p.lastSeen > 5_000) room.players.delete(p.userId);
  }
  if (room.players.size < 2) throw new BombGameError("2명 이상 모여야 시작할 수 있어요.", 409);
  for (const p of room.players.values()) p.alive = true;
  room.round = 0;
  room.winnerId = null;
  startRound(room, now);
  room.updatedAt = now;
  return toView(room, now);
};

export const backToLobby = (userId: number, roomId: number): BombRoomView => {
  const now = Date.now();
  const room = getRoom(roomId);
  advance(room, now);
  if (room.hostId !== userId) throw new BombGameError("방장만 할 수 있어요.", 403);
  if (room.status !== "done") throw new BombGameError("게임이 끝난 뒤에 할 수 있어요.", 409);
  room.status = "lobby";
  room.round = 0;
  room.winnerId = null;
  room.lastExploded = null;
  for (const p of room.players.values()) p.alive = true;
  respawn(room, false);
  room.updatedAt = now;
  return toView(room, now);
};

// 0.05초마다 호출되는 핫패스: 내 위치를 반영하고 방 상태를 돌려준다.
export const syncRoom = (userId: number, roomId: number, pos: { x: number; y: number } | null): BombRoomView => {
  const now = Date.now();
  const room = getRoom(roomId);
  advance(room, now);
  const me = room.players.get(userId);
  if (!me) throw new BombGameError("방에 참가하지 않았어요.", 404);
  me.lastSeen = now;
  room.updatedAt = now;

  const canMove = me.alive && (room.status === "lobby" || room.status === "playing" || room.status === "done");
  if (pos && canMove && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    const speed = room.bombHolder === userId ? HOLDER_SPEED : SPEED;
    const elapsed = Math.min(1_000, now - me.lastMoveAt);
    const maxDist = (speed * elapsed) / 1000 * 1.4 + 16; // 네트워크 지연 여유
    let dx = pos.x - me.x;
    let dy = pos.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    me.x = clamp(me.x + dx, PLAYER_R, ARENA_W - PLAYER_R);
    me.y = clamp(me.y + dy, PLAYER_R, ARENA_H - PLAYER_R);
  }
  me.lastMoveAt = now;
  tryPass(room, now);
  return toView(room, now);
};

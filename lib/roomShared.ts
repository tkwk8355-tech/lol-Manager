// =============================================================
// 방꾸미기: 서버/화면이 함께 쓰는 상품 목록과 배치 규칙
// - 가구 그림은 app/components/room/roomArt.ts (key로 연결)
// - 가격(price)은 포인트. 0이면 기본 제공(1개)이라 살 필요 없음.
// - 새 상품: 여기 CATALOG에 한 줄 + (가구/벽 장식이면) roomArt.ts에 그림 함수 추가
// =============================================================

/** 테스트 기간: true면 모든 상품 무료 (가격은 CATALOG에 그대로 두고, 끝나면 false로) */
export const FREE_FOR_NOW = true;

export const ROOM_SIZE = 8; // 바닥 8 × 8칸
export const WALL_HEIGHT = 3; // 벽 높이 (칸)
export const MAX_ROOM_ITEMS = 60;
export const MAX_COPIES = 4; // 가구 · 벽 장식은 같은 것을 4개까지

export type ItemCat = "floor" | "rug" | "wall" | "wallpaper" | "flooring" | "frame" | "icon";

export type CatalogItem = {
  key: string;
  name: string;
  cat: ItemCat;
  price: number;
  /** floor/rug: 가로 w × 세로 d 칸, h = 높이(선택 표시용). wall: 폭 w, 바닥에서 z ~ z+h */
  w?: number;
  d?: number;
  h?: number;
  z?: number;
  /** icon: 프로필 동그라미 안에 들어갈 이모지 */
  emoji?: string;
};

export const CATALOG: CatalogItem[] = [
  // ---------- 가구 ----------
  { key: "bed", name: "포근한 침대", cat: "floor", price: 0, w: 2, d: 3, h: 1.1 },
  { key: "desk", name: "책상", cat: "floor", price: 0, w: 2, d: 1, h: 1.6 },
  { key: "chair", name: "의자", cat: "floor", price: 0, w: 1, d: 1, h: 1.2 },
  { key: "plant", name: "화분", cat: "floor", price: 0, w: 1, d: 1, h: 1.4 },
  { key: "sofa", name: "소파", cat: "floor", price: 120, w: 2, d: 1, h: 1.0 },
  { key: "armchair", name: "1인 소파", cat: "floor", price: 70, w: 1, d: 1, h: 1.0 },
  { key: "lowtable", name: "좌식 테이블", cat: "floor", price: 50, w: 2, d: 1, h: 0.6 },
  { key: "bookshelf", name: "책장", cat: "floor", price: 80, w: 1, d: 1, h: 2.2 },
  { key: "dresser", name: "서랍장", cat: "floor", price: 70, w: 2, d: 1, h: 1.0 },
  { key: "wardrobe", name: "옷장", cat: "floor", price: 110, w: 2, d: 1, h: 2.4 },
  { key: "fridge", name: "냉장고", cat: "floor", price: 90, w: 1, d: 1, h: 2.1 },
  { key: "counter", name: "주방 싱크대", cat: "floor", price: 100, w: 2, d: 1, h: 1.0 },
  { key: "tv", name: "TV", cat: "floor", price: 130, w: 2, d: 1, h: 1.45 },
  { key: "gamingpc", name: "게이밍 데스크", cat: "floor", price: 200, w: 2, d: 1, h: 1.8 },
  { key: "arcade", name: "오락기", cat: "floor", price: 180, w: 1, d: 1, h: 2.0 },
  { key: "floorlamp", name: "스탠드 조명", cat: "floor", price: 40, w: 1, d: 1, h: 2.2 },
  { key: "cushion", name: "방석", cat: "floor", price: 20, w: 1, d: 1, h: 0.25 },
  { key: "cat", name: "고양이", cat: "floor", price: 150, w: 1, d: 1, h: 0.7 },
  { key: "dog", name: "강아지", cat: "floor", price: 150, w: 1, d: 1, h: 0.7 },
  { key: "nightstand", name: "협탁", cat: "floor", price: 30, w: 1, d: 1, h: 1.0 },
  { key: "stool", name: "스툴", cat: "floor", price: 25, w: 1, d: 1, h: 0.6 },
  { key: "beanbag", name: "빈백", cat: "floor", price: 50, w: 1, d: 1, h: 0.7 },
  { key: "teddy", name: "곰인형", cat: "floor", price: 60, w: 1, d: 1, h: 0.8 },
  { key: "cactus", name: "선인장", cat: "floor", price: 30, w: 1, d: 1, h: 1.2 },
  { key: "monstera", name: "몬스테라", cat: "floor", price: 60, w: 1, d: 1, h: 1.9 },
  { key: "speaker", name: "스피커", cat: "floor", price: 50, w: 1, d: 1, h: 1.1 },
  { key: "guitar", name: "기타", cat: "floor", price: 90, w: 1, d: 1, h: 1.6 },
  { key: "washer", name: "세탁기", cat: "floor", price: 90, w: 1, d: 1, h: 1.05 },
  { key: "diningtable", name: "식탁", cat: "floor", price: 100, w: 2, d: 2, h: 1.2 },
  { key: "aquarium", name: "어항", cat: "floor", price: 160, w: 2, d: 1, h: 1.5 },
  { key: "vending", name: "자판기", cat: "floor", price: 170, w: 1, d: 1, h: 2.2 },
  { key: "trophy", name: "우승 트로피", cat: "floor", price: 140, w: 1, d: 1, h: 1.6 },
  { key: "piano", name: "피아노", cat: "floor", price: 220, w: 2, d: 1, h: 1.35 },
  { key: "xmastree", name: "크리스마스 트리", cat: "floor", price: 120, w: 1, d: 1, h: 2.3 },
  // ---------- 러그 (가구 밑에 깔 수 있음) ----------
  { key: "rug", name: "네모 러그", cat: "rug", price: 0, w: 2, d: 3, h: 0.05 },
  { key: "roundrug", name: "동그라미 러그", cat: "rug", price: 40, w: 2, d: 2, h: 0.05 },
  { key: "heartrug", name: "하트 러그", cat: "rug", price: 50, w: 2, d: 2, h: 0.05 },
  { key: "striperug", name: "줄무늬 러그", cat: "rug", price: 50, w: 3, d: 2, h: 0.05 },
  // ---------- 벽 장식 ----------
  { key: "window", name: "창문", cat: "wall", price: 0, w: 2, z: 0.9, h: 1.3 },
  { key: "picture", name: "풍경 액자", cat: "wall", price: 30, w: 1, z: 1.3, h: 0.8 },
  { key: "poster", name: "별 포스터", cat: "wall", price: 30, w: 1, z: 1.1, h: 1.2 },
  { key: "wallshelf", name: "벽 선반", cat: "wall", price: 40, w: 2, z: 1.7, h: 0.5 },
  { key: "clock", name: "벽시계", cat: "wall", price: 30, w: 1, z: 1.9, h: 0.7 },
  { key: "mirror", name: "거울", cat: "wall", price: 50, w: 1, z: 0.7, h: 1.5 },
  { key: "corkboard", name: "메모 보드", cat: "wall", price: 40, w: 2, z: 1.1, h: 1.0 },
  { key: "clanflag", name: "또간집 깃발", cat: "wall", price: 80, w: 1, z: 1.1, h: 1.4 },
  { key: "neon", name: "GG 네온사인", cat: "wall", price: 120, w: 2, z: 1.6, h: 0.75 },
  { key: "lights", name: "전구 줄조명", cat: "wall", price: 70, w: 3, z: 2.3, h: 0.45 },
  // ---------- 벽지 ----------
  { key: "wp_cream", name: "크림 벽지", cat: "wallpaper", price: 0 },
  { key: "wp_pink", name: "핑크 줄무늬", cat: "wallpaper", price: 60 },
  { key: "wp_mint", name: "민트 땡땡이", cat: "wallpaper", price: 60 },
  { key: "wp_sky", name: "하늘 구름", cat: "wallpaper", price: 80 },
  { key: "wp_night", name: "밤하늘", cat: "wallpaper", price: 100 },
  { key: "wp_brick", name: "빨간 벽돌", cat: "wallpaper", price: 80 },
  { key: "wp_wood", name: "나무 패널", cat: "wallpaper", price: 80 },
  { key: "wp_lavender", name: "라벤더 체크", cat: "wallpaper", price: 60 },
  // ---------- 바닥 ----------
  { key: "fl_wood", name: "원목 마루", cat: "flooring", price: 0 },
  { key: "fl_birch", name: "밝은 마루", cat: "flooring", price: 60 },
  { key: "fl_pink", name: "핑크 타일", cat: "flooring", price: 60 },
  { key: "fl_check", name: "체크 타일", cat: "flooring", price: 80 },
  { key: "fl_carpet", name: "회색 카펫", cat: "flooring", price: 60 },
  { key: "fl_dark", name: "진한 마루", cat: "flooring", price: 60 },
  { key: "fl_marble", name: "대리석", cat: "flooring", price: 100 },
  { key: "fl_grass", name: "잔디", cat: "flooring", price: 80 },
  // ---------- 프로필 테두리 ----------
  { key: "frame_none", name: "기본", cat: "frame", price: 0 },
  { key: "frame_gold", name: "골드", cat: "frame", price: 150 },
  { key: "frame_sakura", name: "벚꽃", cat: "frame", price: 200 },
  { key: "frame_neon", name: "네온", cat: "frame", price: 250 },
  { key: "frame_rainbow", name: "무지개", cat: "frame", price: 300 },
  { key: "frame_galaxy", name: "은하수", cat: "frame", price: 400 },
  { key: "frame_crown", name: "왕관", cat: "frame", price: 600 },
  { key: "frame_leaf", name: "새싹", cat: "frame", price: 150 },
  { key: "frame_heart", name: "하트", cat: "frame", price: 200 },
  { key: "frame_ice", name: "얼음", cat: "frame", price: 250 },
  { key: "frame_fire", name: "불꽃", cat: "frame", price: 300 },
  { key: "frame_star", name: "별밤", cat: "frame", price: 300 },
  { key: "frame_xmas", name: "크리스마스", cat: "frame", price: 250 },
  { key: "frame_diamond", name: "다이아", cat: "frame", price: 500 },
  { key: "frame_aurora", name: "오로라 (움직임)", cat: "frame", price: 700 },
  // ---------- 프로필 아이콘 (동그라미 안 그림. 기본은 닉네임 첫 글자) ----------
  { key: "icon_letter", name: "닉네임 글자", cat: "icon", price: 0 },
  { key: "icon_cat", name: "고양이", cat: "icon", price: 100, emoji: "🐱" },
  { key: "icon_dog", name: "강아지", cat: "icon", price: 100, emoji: "🐶" },
  { key: "icon_rabbit", name: "토끼", cat: "icon", price: 100, emoji: "🐰" },
  { key: "icon_bear", name: "곰", cat: "icon", price: 100, emoji: "🐻" },
  { key: "icon_fox", name: "여우", cat: "icon", price: 120, emoji: "🦊" },
  { key: "icon_panda", name: "판다", cat: "icon", price: 120, emoji: "🐼" },
  { key: "icon_frog", name: "개구리", cat: "icon", price: 120, emoji: "🐸" },
  { key: "icon_penguin", name: "펭귄", cat: "icon", price: 120, emoji: "🐧" },
  { key: "icon_tiger", name: "호랑이", cat: "icon", price: 150, emoji: "🐯" },
  { key: "icon_chick", name: "병아리", cat: "icon", price: 150, emoji: "🐥" },
  { key: "icon_ghost", name: "유령", cat: "icon", price: 150, emoji: "👻" },
  { key: "icon_alien", name: "외계인", cat: "icon", price: 200, emoji: "👽" },
  { key: "icon_robot", name: "로봇", cat: "icon", price: 200, emoji: "🤖" },
  { key: "icon_unicorn", name: "유니콘", cat: "icon", price: 300, emoji: "🦄" },
  { key: "icon_dragon", name: "용", cat: "icon", price: 400, emoji: "🐲" },
];

export const CATALOG_MAP: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map(i => [i.key, i]));

/** 한 번만 사면 되는 종류 (벽지/바닥/테두리/아이콘) */
export const isOnceOnly = (cat: ItemCat) => cat === "wallpaper" || cat === "flooring" || cat === "frame" || cat === "icon";

// ------------------------------ 방 데이터 ------------------------------

export type FloorPlacement = { k: string; x: number; y: number; r: 0 | 1 };
export type WallPlacement = { k: string; wall: "L" | "R"; u: number };
export type Placement = FloorPlacement | WallPlacement;

export type RoomData = { wallpaper: string; flooring: string; items: Placement[] };

export const DEFAULT_ROOM: RoomData = {
  wallpaper: "wp_cream",
  flooring: "fl_wood",
  items: [
    { k: "window", wall: "R", u: 2 },
    { k: "bed", x: 0, y: 0, r: 1 },
    { k: "rug", x: 3, y: 3, r: 0 },
    { k: "desk", x: 6, y: 0, r: 1 },
    { k: "chair", x: 5, y: 0, r: 0 },
    { k: "plant", x: 0, y: 7, r: 0 },
  ],
};

export const isWallPlacement = (p: Placement): p is WallPlacement => "wall" in p;

/** 바닥 가구가 차지하는 칸 (회전하면 가로/세로가 바뀜) */
export const footprint = (p: FloorPlacement) => {
  const c = CATALOG_MAP[p.k];
  const w = c?.w ?? 1, d = c?.d ?? 1;
  return p.r === 1 ? { w: d, d: w } : { w, d };
};

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** 이 자리에 놓을 수 있는지 (ignore = 지금 옮기는 가구의 번호) */
export const canPlace = (items: Placement[], p: Placement, ignore = -1): boolean => {
  const c = CATALOG_MAP[p.k];
  if (!c) return false;
  if (isWallPlacement(p)) {
    const w = c.w ?? 1;
    if (p.u < 0 || p.u + w > ROOM_SIZE) return false;
    return items.every((o, i) => {
      if (i === ignore || !isWallPlacement(o) || o.wall !== p.wall) return true;
      return !overlap(p.u, p.u + w, o.u, o.u + (CATALOG_MAP[o.k]?.w ?? 1));
    });
  }
  const { w, d } = footprint(p);
  if (p.x < 0 || p.y < 0 || p.x + w > ROOM_SIZE || p.y + d > ROOM_SIZE) return false;
  return items.every((o, i) => {
    if (i === ignore || isWallPlacement(o)) return true;
    // 러그끼리, 가구끼리만 겹치면 안 됨 (러그 위에는 가구를 놓을 수 있다)
    if ((CATALOG_MAP[o.k]?.cat === "rug") !== (c.cat === "rug")) return true;
    const f = footprint(o);
    return !(overlap(p.x, p.x + w, o.x, o.x + f.w) && overlap(p.y, p.y + d, o.y, o.y + f.d));
  });
};

/** 비어 있는 첫 자리 찾기 (새 가구 놓을 때) */
export const findFreeSpot = (items: Placement[], key: string): Placement | null => {
  const c = CATALOG_MAP[key];
  if (!c) return null;
  if (c.cat === "wall") {
    for (const wall of ["R", "L"] as const) {
      for (let u = 0; u < ROOM_SIZE; u++) {
        const p: WallPlacement = { k: key, wall, u };
        if (canPlace(items, p)) return p;
      }
    }
    return null;
  }
  for (const r of [0, 1] as const) {
    for (let s = 0; s < ROOM_SIZE * 2; s++) {
      for (let x = 0; x <= s; x++) {
        const p: FloorPlacement = { k: key, x, y: s - x, r };
        if (canPlace(items, p)) return p;
      }
    }
  }
  return null;
};

/** 지금 적용되는 가격 (무료 기간이면 0) */
export const priceOf = (item: CatalogItem) => (FREE_FOR_NOW ? 0 : item.price);

/** 기본 제공 포함, 가진 개수. 무료 기간엔 가구는 MAX_COPIES개, 나머지는 1개씩 다 가진 것으로 본다 */
export const availableCount = (owned: Record<string, number>, key: string) => {
  const c = CATALOG_MAP[key];
  if (!c) return 0;
  if (FREE_FOR_NOW) return isOnceOnly(c.cat) ? 1 : MAX_COPIES;
  return (c.price === 0 ? 1 : 0) + (owned[key] ?? 0);
};

/** 저장 전 검사: 잘못됐으면 오류 문장, 괜찮으면 정리된 방 데이터 */
export const validateRoom = (raw: unknown, owned: Record<string, number>): { room: RoomData } | { error: string } => {
  if (!raw || typeof raw !== "object") return { error: "잘못된 방 데이터" };
  const r = raw as Record<string, unknown>;
  const wallpaper = String(r.wallpaper ?? "");
  const flooring = String(r.flooring ?? "");
  if (CATALOG_MAP[wallpaper]?.cat !== "wallpaper" || availableCount(owned, wallpaper) < 1) return { error: "갖고 있지 않은 벽지예요." };
  if (CATALOG_MAP[flooring]?.cat !== "flooring" || availableCount(owned, flooring) < 1) return { error: "갖고 있지 않은 바닥이에요." };
  if (!Array.isArray(r.items) || r.items.length > MAX_ROOM_ITEMS) return { error: `가구는 ${MAX_ROOM_ITEMS}개까지 놓을 수 있어요.` };

  const items: Placement[] = [];
  const used: Record<string, number> = {};
  for (const it of r.items as unknown[]) {
    if (!it || typeof it !== "object") return { error: "잘못된 가구 데이터" };
    const o = it as Record<string, unknown>;
    const k = String(o.k ?? "");
    const c = CATALOG_MAP[k];
    if (!c || (c.cat !== "floor" && c.cat !== "rug" && c.cat !== "wall")) return { error: "없는 가구예요." };
    used[k] = (used[k] ?? 0) + 1;
    if (used[k] > availableCount(owned, k)) return { error: `${c.name}을(를) 가진 것보다 많이 놓았어요.` };
    let p: Placement;
    if (c.cat === "wall") {
      if ((o.wall !== "L" && o.wall !== "R") || !Number.isInteger(o.u)) return { error: "잘못된 벽 장식 위치" };
      p = { k, wall: o.wall, u: o.u as number };
    } else {
      if (!Number.isInteger(o.x) || !Number.isInteger(o.y) || (o.r !== 0 && o.r !== 1)) return { error: "잘못된 가구 위치" };
      p = { k, x: o.x as number, y: o.y as number, r: o.r };
    }
    if (!canPlace(items, p)) return { error: `${c.name} 자리가 겹치거나 방 밖이에요.` };
    items.push(p);
  }
  return { room: { wallpaper, flooring, items } };
};

/** DB에서 읽은 JSON → 방 데이터 (깨졌으면 기본 방) */
export const parseRoom = (wallpaper: string | null, flooring: string | null, itemsJson: string | null): RoomData => {
  try {
    const items = itemsJson ? (JSON.parse(itemsJson) as Placement[]) : DEFAULT_ROOM.items;
    return {
      wallpaper: CATALOG_MAP[wallpaper ?? ""]?.cat === "wallpaper" ? wallpaper! : DEFAULT_ROOM.wallpaper,
      flooring: CATALOG_MAP[flooring ?? ""]?.cat === "flooring" ? flooring! : DEFAULT_ROOM.flooring,
      items: Array.isArray(items) ? items.filter(i => CATALOG_MAP[i?.k]) : [],
    };
  } catch {
    return DEFAULT_ROOM;
  }
};

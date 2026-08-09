import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  await ensureSchema();
  const pool = getPool();

  if (q === "") {
    const [rows] = await pool.query("SELECT name_ko, name_en FROM champions ORDER BY name_ko ASC");
    return NextResponse.json({ champions: rows });
  }

  const [rows] = await pool.query(
    `SELECT name_ko, name_en FROM champions WHERE name_ko LIKE ? OR name_en LIKE ? ORDER BY name_ko ASC LIMIT 10`,
    [`%${q}%`, `%${q}%`]
  );
  return NextResponse.json({ champions: rows });
}

export async function POST() {
  try {
    await ensureSchema();
    const pool = getPool();

    const verRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const versions: string[] = await verRes.json();
    const version = versions[0];

    const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`);
    const json = await champRes.json();
    const data = json.data as Record<string, { id: string; name: string }>;

    for (const c of Object.values(data)) {
      await pool.query(
        `INSERT INTO champions (name_ko, name_en) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE name_ko = VALUES(name_ko)`,
        [c.name, c.id]
      );
    }

    return NextResponse.json({ ok: true, version, count: Object.keys(data).length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "챔피언 동기화 실패" }, { status: 500 });
  }
}

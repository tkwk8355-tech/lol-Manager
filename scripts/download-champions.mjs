import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/champions");

const verRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
const versions = await verRes.json();
const version = versions[0];
console.log("DDragon version:", version);

const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`);
const champJson = await champRes.json();
const champs = Object.values(champJson.data);
console.log(`챔피언 수: ${champs.length}`);

let downloaded = 0, skipped = 0;
for (const champ of champs) {
  const filename = `${champ.id}.png`;
  const outPath = join(OUT_DIR, filename);
  if (existsSync(outPath)) { skipped++; continue; }

  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.id}.png`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`SKIP ${champ.id}: ${res.status}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  downloaded++;
  if (downloaded % 20 === 0) console.log(`  ${downloaded}/${champs.length - skipped} 다운로드 중...`);
}

console.log(`완료 — 다운로드: ${downloaded}, 스킵(이미 존재): ${skipped}`);

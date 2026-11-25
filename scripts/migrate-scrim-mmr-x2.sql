-- 내전 MMR 개편: 기존 점수 2배 변환
-- 실행 전 반드시 백업 (scripts/backup-db.ps1)
-- scrim_mmr_logs 과거 기록은 변경하지 않음 (참고용 보존)

CREATE TABLE IF NOT EXISTS scrim_ratings_backup_x2 AS SELECT * FROM scrim_ratings;

UPDATE scrim_ratings SET mmr = GREATEST(0, mmr * 2), updated_at = NOW();

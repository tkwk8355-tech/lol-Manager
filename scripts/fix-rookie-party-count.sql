-- =====================================================================
-- 수습 파티 참여 횟수 보정 (이미 펑한 파티)  — MariaDB 10.3+
-- 기준: 파티 생성 = 1파티, 이후 "새로운 사람이 들어온" 명단 변경마다 +1
--       (빠지기만 한 변경은 제외) 중 수습이 그 명단에 있던 횟수
--       party_count는 자유랭크(flex)/내전(scrim)만 반영, 나머지는 0 (기존 로직과 동일)
-- 순서대로 실행하세요. 4단계 결과를 확인한 뒤 5단계를 실행합니다.
-- =====================================================================

-- 0단계: 백업 (문제 생기면 맨 아래 [되돌리기] 참고)
CREATE TABLE point_logs_bak_rookie_20261115 AS
SELECT * FROM point_logs WHERE type = 'rookie_session';

-- 1단계: history 행을 명단 묶음(스냅샷)으로 나누기
--        같은 파티에서 앞 행과 기록 시각이 2초 넘게 차이 나면 새 묶음
CREATE TABLE tmp_pph_snap AS
SELECT id, party_id, nickname,
       SUM(is_start) OVER (PARTITION BY party_id ORDER BY id) AS snap
FROM (
  SELECT id, party_id, nickname,
         CASE WHEN LAG(added_at) OVER (PARTITION BY party_id ORDER BY id) IS NULL
                OR TIMESTAMPDIFF(SECOND, LAG(added_at) OVER (PARTITION BY party_id ORDER BY id), added_at) > 2
              THEN 1 ELSE 0 END AS is_start
  FROM party_participant_history
) x;

-- 2단계: "새 파티"로 칠 묶음 = 첫 묶음 또는 직전 묶음에 없던 사람이 있는 묶음
CREATE TABLE tmp_pph_newsnap AS
SELECT DISTINCT s.party_id, s.snap
FROM tmp_pph_snap s
WHERE s.snap = 1
   OR NOT EXISTS (
     SELECT 1 FROM tmp_pph_snap p
     WHERE p.party_id = s.party_id AND p.snap = s.snap - 1 AND p.nickname = s.nickname
   );

-- 3단계: 파티별·닉네임별 참여 파티 수
CREATE TABLE tmp_rookie_cnt AS
SELECT s.party_id, s.nickname, COUNT(DISTINCT s.snap) AS cnt
FROM tmp_pph_snap s
JOIN tmp_pph_newsnap n ON n.party_id = s.party_id AND n.snap = s.snap
GROUP BY s.party_id, s.nickname;

-- 4단계: 미리보기 (바뀔 대상만)
SELECT pl.id, a.game_name, p.id AS party_id, p.mode,
       pl.party_count AS old_count,
       CASE WHEN p.mode IN ('flex', 'scrim') THEN c.cnt ELSE 0 END AS new_count,
       pl.comment AS old_comment,
       REGEXP_REPLACE(pl.comment, '수습 파티 [0-9]+회', CONCAT('수습 파티 ', c.cnt, '회')) AS new_comment
FROM point_logs pl
JOIN parties p  ON p.id = pl.ref_id AND pl.ref_table = 'party'
JOIN accounts a ON a.member_id = pl.member_id AND a.is_main = 1
JOIN tmp_rookie_cnt c ON c.party_id = p.id AND c.nickname = a.game_name
WHERE pl.type = 'rookie_session'
  AND (pl.party_count <> CASE WHEN p.mode IN ('flex', 'scrim') THEN c.cnt ELSE 0 END
       OR pl.comment <> REGEXP_REPLACE(pl.comment, '수습 파티 [0-9]+회', CONCAT('수습 파티 ', c.cnt, '회')))
ORDER BY pl.id;

-- 5단계: 반영
UPDATE point_logs pl
JOIN parties p  ON p.id = pl.ref_id AND pl.ref_table = 'party'
JOIN accounts a ON a.member_id = pl.member_id AND a.is_main = 1
JOIN tmp_rookie_cnt c ON c.party_id = p.id AND c.nickname = a.game_name
SET pl.party_count = CASE WHEN p.mode IN ('flex', 'scrim') THEN c.cnt ELSE 0 END,
    pl.comment     = REGEXP_REPLACE(pl.comment, '수습 파티 [0-9]+회', CONCAT('수습 파티 ', c.cnt, '회'))
WHERE pl.type = 'rookie_session';

-- 6단계: 임시 테이블 정리
DROP TABLE tmp_pph_snap;
DROP TABLE tmp_pph_newsnap;
DROP TABLE tmp_rookie_cnt;

-- (참고) 보정 못 한 로그: 수습 본계정 닉네임이 history에 없음 (그 파티 이후 닉 변경 등)
-- ※ 6단계 전에 실행해야 합니다
-- SELECT pl.id, pl.member_id, a.game_name, pl.ref_id AS party_id, pl.comment
-- FROM point_logs pl
-- LEFT JOIN accounts a ON a.member_id = pl.member_id AND a.is_main = 1
-- LEFT JOIN tmp_rookie_cnt c ON c.party_id = pl.ref_id AND c.nickname = a.game_name
-- WHERE pl.type = 'rookie_session' AND pl.ref_table = 'party' AND c.cnt IS NULL;

-- [되돌리기] 5단계 결과가 이상하면:
-- UPDATE point_logs pl JOIN point_logs_bak_rookie_20261115 b ON b.id = pl.id
-- SET pl.party_count = b.party_count, pl.comment = b.comment;
-- 확인이 끝나면 백업 테이블 삭제:
-- DROP TABLE point_logs_bak_rookie_20261115;

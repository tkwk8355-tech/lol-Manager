-- 내전 MMR + 주라인/부라인 초기값 설정
-- 티어 MMR: B=0, S=150, G=250, P=350, E=450, D=550, M=650

INSERT INTO scrim_ratings (member_id, mmr)
SELECT id, mmr FROM (
  SELECT id, 650 AS mmr FROM members WHERE nickname = '님들블루좀'
  UNION ALL SELECT id, 650 FROM members WHERE nickname = '기 류'
  UNION ALL SELECT id, 150 FROM members WHERE nickname = '오홍홍홍희'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '꼬미아빠'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = 'JENY'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '거봉포도'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = 'Chiychi'
  UNION ALL SELECT id, 650 FROM members WHERE nickname = '초대좀요'
  UNION ALL SELECT id, 150 FROM members WHERE nickname = '뒷골목아기고양이'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '개발자'
  UNION ALL SELECT id, 150 FROM members WHERE nickname = '멜 로'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = 'ACL파열'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '커피없이는못살아'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '2222'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '골드정도하는사람'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '옐니쓰'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '내알빠노'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '나 욤'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '무무맛좀봐라'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = 'ShowMeLove'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '피망조커'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '이길수있다화이팅'
  UNION ALL SELECT id, 600 FROM members WHERE nickname = '딩거개충새기'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '내당맨'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '코페르니'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '옹냥냥'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '승 준'
  UNION ALL SELECT id, 650 FROM members WHERE nickname = '오이쉬에'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '한국파이크협회장'
  UNION ALL SELECT id, 650 FROM members WHERE nickname = '따 거'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '미 드'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = 'Deja Vu'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '름파오'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = 'rush'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '미 쯔'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '숟가락과 도구'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '상처엔소라카솔'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = 'if oracle'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '원딜 노조 위원장'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '죄수번호0408'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '저요저요oi'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = 'Castorpollux XD'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '명장동'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '민트초코마라탕'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '김깔드'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '망찌랭이'
  UNION ALL SELECT id, 450 FROM members WHERE nickname = '코니똥'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = 'ROX PraY'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '옵타론'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '타꼬야'
  UNION ALL SELECT id, 350 FROM members WHERE nickname = '태 잼'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '로 디'
  UNION ALL SELECT id, 250 FROM members WHERE nickname = '거대포로댄스'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = '오보에'
  UNION ALL SELECT id, 550 FROM members WHERE nickname = 'redfe'
  UNION ALL SELECT id, 0   FROM members WHERE nickname = '반둥건둥'
) t
ON DUPLICATE KEY UPDATE mmr = VALUES(mmr);

-- 주라인/부라인 업데이트
UPDATE members SET main_line='MID', sub_line='TOP'  WHERE nickname='님들블루좀';
UPDATE members SET main_line='JG',  sub_line='ADC'  WHERE nickname='기 류';
UPDATE members SET main_line='ADC', sub_line='JG'   WHERE nickname='오홍홍홍희';
UPDATE members SET main_line='MID', sub_line='TOP'  WHERE nickname='꼬미아빠';
UPDATE members SET main_line='ADC', sub_line='TOP'  WHERE nickname='JENY';
UPDATE members SET main_line='JG',  sub_line='TOP'  WHERE nickname='거봉포도';
UPDATE members SET main_line='TOP', sub_line='JG'   WHERE nickname='Chiychi';
UPDATE members SET main_line='ADC', sub_line='MID'  WHERE nickname='초대좀요';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='뒷골목아기고양이';
UPDATE members SET main_line='ADC', sub_line='TOP'  WHERE nickname='개발자';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='멜 로';
UPDATE members SET main_line='JG',  sub_line='ADC'  WHERE nickname='ACL파열';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='커피없이는못살아';
UPDATE members SET main_line='JG',  sub_line='ALL'  WHERE nickname='2222';
UPDATE members SET main_line='JG',  sub_line='ALL'  WHERE nickname='골드정도하는사람';
UPDATE members SET main_line='SUP', sub_line='MID'  WHERE nickname='옐니쓰';
UPDATE members SET main_line='ADC', sub_line='ALL'  WHERE nickname='내알빠노';
UPDATE members SET main_line='ADC', sub_line='SUP'  WHERE nickname='나 욤';
UPDATE members SET main_line='JG',  sub_line='TOP'  WHERE nickname='무무맛좀봐라';
UPDATE members SET main_line='ADC', sub_line='TOP'  WHERE nickname='ShowMeLove';
UPDATE members SET main_line='SUP', sub_line='JG'   WHERE nickname='피망조커';
UPDATE members SET main_line='TOP', sub_line='MID'  WHERE nickname='이길수있다화이팅';
UPDATE members SET main_line='TOP', sub_line='MID'  WHERE nickname='딩거개충새기';
UPDATE members SET main_line='MID', sub_line='ADC'  WHERE nickname='내당맨';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='코페르니';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='옹냥냥';
UPDATE members SET main_line='TOP', sub_line='ADC'  WHERE nickname='승 준';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='오이쉬에';
UPDATE members SET main_line='JG',  sub_line='SUP'  WHERE nickname='한국파이크협회장';
UPDATE members SET main_line='SUP', sub_line='ALL'  WHERE nickname='따 거';
UPDATE members SET main_line='MID', sub_line='ADC'  WHERE nickname='미 드';
UPDATE members SET main_line='ADC', sub_line='SUP'  WHERE nickname='Deja Vu';
UPDATE members SET main_line='ADC', sub_line='SUP'  WHERE nickname='름파오';
UPDATE members SET main_line='ADC', sub_line='ALL'  WHERE nickname='rush';
UPDATE members SET main_line='MID', sub_line='TOP'  WHERE nickname='미 쯔';
UPDATE members SET main_line='SUP', sub_line='JG'   WHERE nickname='숟가락과 도구';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='상처엔소라카솔';
UPDATE members SET main_line='JG',  sub_line='SUP'  WHERE nickname='if oracle';
UPDATE members SET main_line='ADC', sub_line='ALL'  WHERE nickname='원딜 노조 위원장';
UPDATE members SET main_line='ADC', sub_line='JG'   WHERE nickname='죄수번호0408';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='저요저요oi';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='Castorpollux XD';
UPDATE members SET main_line='MID', sub_line='ALL'  WHERE nickname='명장동';
UPDATE members SET main_line='JG',  sub_line='TOP'  WHERE nickname='민트초코마라탕';
UPDATE members SET main_line='TOP', sub_line='SUP'  WHERE nickname='김깔드';
UPDATE members SET main_line='ADC', sub_line='ALL'  WHERE nickname='망찌랭이';
UPDATE members SET main_line='SUP', sub_line='JG'   WHERE nickname='코니똥';
UPDATE members SET main_line='MID', sub_line='ADC'  WHERE nickname='ROX PraY';
UPDATE members SET main_line='TOP', sub_line='ALL'  WHERE nickname='옵타론';
UPDATE members SET main_line='TOP', sub_line='ALL'  WHERE nickname='타꼬야';
UPDATE members SET main_line='JG',  sub_line='ADC'  WHERE nickname='태 잼';
UPDATE members SET main_line='ADC', sub_line='ALL'  WHERE nickname='로 디';
UPDATE members SET main_line='JG',  sub_line='ADC'  WHERE nickname='거대포로댄스';
UPDATE members SET main_line='SUP', sub_line='ALL'  WHERE nickname='오보에';
UPDATE members SET main_line='ADC', sub_line='SUP'  WHERE nickname='redfe';
UPDATE members SET main_line='SUP', sub_line='ADC'  WHERE nickname='반둥건둥';

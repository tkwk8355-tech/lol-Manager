SELECT COUNT(*) as no_log_parties
FROM parties p
WHERE p.status = 'ended'
AND NOT EXISTS (
  SELECT 1 FROM point_logs pl WHERE pl.ref_id = p.id AND pl.ref_table = 'party'
);

UPDATE parties p
JOIN (
  SELECT ref_id, MIN(given_by) AS given_by
  FROM point_logs
  WHERE ref_table = 'party' AND given_by IS NOT NULL
  GROUP BY ref_id
) pl ON pl.ref_id = p.id
SET p.ended_by = pl.given_by
WHERE p.status = 'ended' AND p.ended_by IS NULL;

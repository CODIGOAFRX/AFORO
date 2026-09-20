ALTER TABLE experiment DROP CONSTRAINT experiment_seats_per_buyer_check;
ALTER TABLE experiment ADD CONSTRAINT experiment_seats_per_buyer_check CHECK (seats_per_buyer IN (0,1,2));
COMMENT ON COLUMN experiment.seats_per_buyer IS '0: random group of 1-3; 1 or 2: fixed group size';

-- Rename category value "community" to "city"
UPDATE photos SET category = 'city' WHERE category = 'community';
UPDATE collections SET category = 'city' WHERE category = 'community';

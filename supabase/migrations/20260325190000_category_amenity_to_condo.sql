-- Replace deprecated category value "amenity" with "condo"
UPDATE photos SET category = 'condo' WHERE category = 'amenity';
UPDATE collections SET category = 'condo' WHERE category = 'amenity';

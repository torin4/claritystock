-- Add structured "City - Neighborhood" entries for major Puget Sound cities.
-- Existing flat city/neighborhood entries are preserved (ON CONFLICT DO NOTHING).
-- Autocomplete uses substring matching, so typing just the neighborhood name (e.g., "Totem Lake")
-- will surface "Kirkland - Totem Lake", and typing "Kirkland" shows all Kirkland entries.

INSERT INTO public.neighborhood_canonicals (label) VALUES

-- ============================================================
-- SEATTLE neighborhoods (structured)
-- ============================================================
  ('Seattle - Alki'),
  ('Seattle - Arbor Heights'),
  ('Seattle - Atlantic'),
  ('Seattle - Beacon Hill'),
  ('Seattle - Belltown'),
  ('Seattle - Blue Ridge'),
  ('Seattle - Brighton'),
  ('Seattle - Broadmoor'),
  ('Seattle - Broadview'),
  ('Seattle - Bryant'),
  ('Seattle - Capitol Hill'),
  ('Seattle - Central District'),
  ('Seattle - Cherry Hill'),
  ('Seattle - Chinatown-International District'),
  ('Seattle - Columbia City'),
  ('Seattle - Crown Hill'),
  ('Seattle - Delridge'),
  ('Seattle - Denny Regrade'),
  ('Seattle - Denny Triangle'),
  ('Seattle - Denny-Blaine'),
  ('Seattle - Downtown'),
  ('Seattle - Dunlap'),
  ('Seattle - East Queen Anne'),
  ('Seattle - Eastlake'),
  ('Seattle - Fauntleroy'),
  ('Seattle - First Hill'),
  ('Seattle - Fremont'),
  ('Seattle - Gatewood'),
  ('Seattle - Genesee'),
  ('Seattle - Georgetown'),
  ('Seattle - Green Lake'),
  ('Seattle - Greenwood'),
  ('Seattle - Haller Lake'),
  ('Seattle - Harbor Island'),
  ('Seattle - Hawthorne Hills'),
  ('Seattle - High Point'),
  ('Seattle - Highland Park'),
  ('Seattle - Hillman City'),
  ('Seattle - Industrial District'),
  ('Seattle - Interbay'),
  ('Seattle - International District'),
  ('Seattle - Judkins Park'),
  ('Seattle - Lake City'),
  ('Seattle - Laurelhurst'),
  ('Seattle - Leschi'),
  ('Seattle - Licton Springs'),
  ('Seattle - Lower Queen Anne'),
  ('Seattle - Loyal Heights'),
  ('Seattle - Madison Park'),
  ('Seattle - Madison Valley'),
  ('Seattle - Madrona'),
  ('Seattle - Magnolia'),
  ('Seattle - Maple Leaf'),
  ('Seattle - Matthews Beach'),
  ('Seattle - Meadowbrook'),
  ('Seattle - Montlake'),
  ('Seattle - Mount Baker'),
  ('Seattle - NewHolly'),
  ('Seattle - North Admiral'),
  ('Seattle - North Beach'),
  ('Seattle - North Beacon Hill'),
  ('Seattle - North Delridge'),
  ('Seattle - North Queen Anne'),
  ('Seattle - Northgate'),
  ('Seattle - Olympic Hills'),
  ('Seattle - Phinney Ridge'),
  ('Seattle - Pike Place Market'),
  ('Seattle - Pioneer Square'),
  ('Seattle - Queen Anne'),
  ('Seattle - Rainier Beach'),
  ('Seattle - Rainier Valley'),
  ('Seattle - Ravenna'),
  ('Seattle - Roosevelt'),
  ('Seattle - Roxhill'),
  ('Seattle - Sand Point'),
  ('Seattle - Seward Park'),
  ('Seattle - SoDo'),
  ('Seattle - South Beacon Hill'),
  ('Seattle - South Lake Union'),
  ('Seattle - South Park'),
  ('Seattle - Southeast Seattle'),
  ('Seattle - Squire Park'),
  ('Seattle - Sunset Hill'),
  ('Seattle - University District'),
  ('Seattle - View Ridge'),
  ('Seattle - Wallingford'),
  ('Seattle - Washington Park'),
  ('Seattle - Wedgwood'),
  ('Seattle - West Seattle'),
  ('Seattle - West Seattle Junction'),
  ('Seattle - Westlake'),
  ('Seattle - Whittier Heights'),
  ('Seattle - Windermere'),
  ('Seattle - Yesler Terrace'),

-- ============================================================
-- BELLEVUE neighborhoods
-- ============================================================
  ('Bellevue - Ardmore'),
  ('Bellevue - Bel-Red'),
  ('Bellevue - Bridle Trails'),
  ('Bellevue - Coal Creek'),
  ('Bellevue - Crossroads'),
  ('Bellevue - Downtown'),
  ('Bellevue - Eastgate'),
  ('Bellevue - Eastridge'),
  ('Bellevue - Enatai'),
  ('Bellevue - Factoria'),
  ('Bellevue - Lake Hills'),
  ('Bellevue - Midlakes'),
  ('Bellevue - Newport Hills'),
  ('Bellevue - Newport Shores'),
  ('Bellevue - Overlake'),
  ('Bellevue - Phantom Lake'),
  ('Bellevue - Robinswood'),
  ('Bellevue - Somerset'),
  ('Bellevue - South Bellevue'),
  ('Bellevue - Surrey Downs'),
  ('Bellevue - West Bellevue'),
  ('Bellevue - Wilburton'),
  ('Bellevue - Woodridge'),

-- ============================================================
-- KIRKLAND neighborhoods
-- ============================================================
  ('Kirkland - Bridle Trails'),
  ('Kirkland - Downtown'),
  ('Kirkland - Everest'),
  ('Kirkland - Finn Hill'),
  ('Kirkland - Houghton'),
  ('Kirkland - Juanita'),
  ('Kirkland - Kingsgate'),
  ('Kirkland - Lakeview'),
  ('Kirkland - Market'),
  ('Kirkland - Moss Bay'),
  ('Kirkland - North Rose Hill'),
  ('Kirkland - Norkirk'),
  ('Kirkland - South Rose Hill'),
  ('Kirkland - Totem Lake'),
  ('Kirkland - Waterfront'),

-- ============================================================
-- REDMOND neighborhoods
-- ============================================================
  ('Redmond - Bear Creek'),
  ('Redmond - Downtown'),
  ('Redmond - Education Hill'),
  ('Redmond - Evans Creek'),
  ('Redmond - Grass Lawn'),
  ('Redmond - Overlake'),
  ('Redmond - Perrigo Heights'),
  ('Redmond - Union Hill'),
  ('Redmond - Willows'),

-- ============================================================
-- SAMMAMISH neighborhoods
-- ============================================================
  ('Sammamish - East Lake Sammamish'),
  ('Sammamish - Inglewood'),
  ('Sammamish - Klahanie'),
  ('Sammamish - Pine Lake'),
  ('Sammamish - Sahalee'),
  ('Sammamish - Trossachs'),

-- ============================================================
-- ISSAQUAH neighborhoods
-- ============================================================
  ('Issaquah - Cougar Mountain'),
  ('Issaquah - Downtown'),
  ('Issaquah - Gilman Village'),
  ('Issaquah - Issaquah Highlands'),
  ('Issaquah - Olde Town'),
  ('Issaquah - Talus'),

-- ============================================================
-- BOTHELL neighborhoods
-- ============================================================
  ('Bothell - Canyon Park'),
  ('Bothell - Country Village'),
  ('Bothell - Downtown'),
  ('Bothell - North Creek'),
  ('Bothell - Queensborough'),

-- ============================================================
-- KENMORE neighborhoods
-- ============================================================
  ('Kenmore - Arrowhead'),
  ('Kenmore - Finn Hill'),
  ('Kenmore - Inglewood'),

-- ============================================================
-- SHORELINE neighborhoods
-- ============================================================
  ('Shoreline - Echo Lake'),
  ('Shoreline - Hillwood'),
  ('Shoreline - Innis Arden'),
  ('Shoreline - Jackson Park'),
  ('Shoreline - Meridian Park'),
  ('Shoreline - Parkwood'),
  ('Shoreline - Richmond Beach'),
  ('Shoreline - Richmond Highlands'),
  ('Shoreline - Ronald'),
  ('Shoreline - Twin Ponds'),

-- ============================================================
-- MERCER ISLAND neighborhoods
-- ============================================================
  ('Mercer Island - East Seattle'),
  ('Mercer Island - Island Crest'),
  ('Mercer Island - North End'),
  ('Mercer Island - South End'),
  ('Mercer Island - Town Center'),

-- ============================================================
-- RENTON neighborhoods
-- ============================================================
  ('Renton - Benson Hill'),
  ('Renton - Cascade'),
  ('Renton - Downtown'),
  ('Renton - East Highlands'),
  ('Renton - Fairwood'),
  ('Renton - Highlands'),
  ('Renton - Kennydale'),
  ('Renton - Maplewood'),
  ('Renton - North Renton'),
  ('Renton - Talbot Hill'),
  ('Renton - West Hill'),

-- ============================================================
-- KENT neighborhoods
-- ============================================================
  ('Kent - Downtown'),
  ('Kent - East Hill'),
  ('Kent - Meridian'),
  ('Kent - Panther Lake'),
  ('Kent - Riverview'),
  ('Kent - Scenic Hill'),
  ('Kent - West Hill'),

-- ============================================================
-- AUBURN neighborhoods
-- ============================================================
  ('Auburn - Downtown'),
  ('Auburn - East Hill'),
  ('Auburn - Lakeland Hills'),
  ('Auburn - Lea Hill'),
  ('Auburn - Terminal Park'),
  ('Auburn - West Hill'),

-- ============================================================
-- FEDERAL WAY neighborhoods
-- ============================================================
  ('Federal Way - Adelaide'),
  ('Federal Way - Camelot'),
  ('Federal Way - Dash Point'),
  ('Federal Way - Downtown'),
  ('Federal Way - Redondo'),
  ('Federal Way - Steel Lake'),
  ('Federal Way - Twin Lakes'),

-- ============================================================
-- BURIEN neighborhoods
-- ============================================================
  ('Burien - Boulevard Park'),
  ('Burien - Downtown'),
  ('Burien - Hazel Valley'),
  ('Burien - Seahurst'),
  ('Burien - Three Tree Point'),

-- ============================================================
-- TUKWILA neighborhoods
-- ============================================================
  ('Tukwila - Andover Park'),
  ('Tukwila - Downtown'),
  ('Tukwila - Foster'),
  ('Tukwila - Riverton'),

-- ============================================================
-- SEATAC neighborhoods
-- ============================================================
  ('SeaTac - Downtown'),
  ('SeaTac - McMicken Heights'),
  ('SeaTac - Riverton Heights'),

-- ============================================================
-- LAKE FOREST PARK neighborhoods
-- ============================================================
  ('Lake Forest Park - Brookside'),
  ('Lake Forest Park - Sheridan Beach'),
  ('Lake Forest Park - Town Center'),

-- ============================================================
-- WOODINVILLE neighborhoods
-- ============================================================
  ('Woodinville - Downtown'),
  ('Woodinville - Hollywood Hill'),
  ('Woodinville - Tolt Hill'),
  ('Woodinville - Wine Country'),

-- ============================================================
-- SNOQUALMIE neighborhoods
-- ============================================================
  ('Snoqualmie - Downtown'),
  ('Snoqualmie - Snoqualmie Ridge'),

-- ============================================================
-- NORTH BEND neighborhoods
-- ============================================================
  ('North Bend - Downtown'),
  ('North Bend - Mount Si'),

-- ============================================================
-- EDMONDS neighborhoods
-- ============================================================
  ('Edmonds - Bowl'),
  ('Edmonds - Downtown'),
  ('Edmonds - Five Corners'),
  ('Edmonds - Meadowdale'),
  ('Edmonds - Westgate'),

-- ============================================================
-- LYNNWOOD neighborhoods
-- ============================================================
  ('Lynnwood - Alderwood'),
  ('Lynnwood - Cedar Valley'),
  ('Lynnwood - Downtown'),
  ('Lynnwood - Meadowdale'),

-- ============================================================
-- EVERETT neighborhoods
-- ============================================================
  ('Everett - Bayside'),
  ('Everett - Casino Road'),
  ('Everett - Central'),
  ('Everett - Downtown'),
  ('Everett - Eastmont'),
  ('Everett - Evergreen'),
  ('Everett - Harborview'),
  ('Everett - Holly'),
  ('Everett - Lowell'),
  ('Everett - Merrill'),
  ('Everett - North Broadway'),
  ('Everett - Port Gardner'),
  ('Everett - Silver Lake'),
  ('Everett - Sunrise'),
  ('Everett - View Ridge'),

-- ============================================================
-- MARYSVILLE neighborhoods
-- ============================================================
  ('Marysville - Downtown'),
  ('Marysville - Grove'),
  ('Marysville - Soper Hill'),
  ('Marysville - Tulalip'),

-- ============================================================
-- MUKILTEO neighborhoods
-- ============================================================
  ('Mukilteo - Downtown'),
  ('Mukilteo - Japanese Gulch'),
  ('Mukilteo - Lighthouse'),

-- ============================================================
-- MILL CREEK neighborhoods
-- ============================================================
  ('Mill Creek - Bothell-Everett Highway'),
  ('Mill Creek - Downtown'),
  ('Mill Creek - Mill Creek Town Center'),

-- ============================================================
-- MONROE neighborhoods
-- ============================================================
  ('Monroe - Downtown'),
  ('Monroe - Florence Acres'),

-- ============================================================
-- SNOHOMISH neighborhoods
-- ============================================================
  ('Snohomish - Avenue D'),
  ('Snohomish - Downtown'),
  ('Snohomish - Harvey Airfield'),

-- ============================================================
-- MOUNTLAKE TERRACE neighborhoods
-- ============================================================
  ('Mountlake Terrace - Ballinger'),
  ('Mountlake Terrace - Downtown'),

-- ============================================================
-- LAKE STEVENS neighborhoods
-- ============================================================
  ('Lake Stevens - Downtown'),
  ('Lake Stevens - Frontier Village'),

-- ============================================================
-- BAINBRIDGE ISLAND neighborhoods
-- ============================================================
  ('Bainbridge Island - Battle Point'),
  ('Bainbridge Island - Eagle Harbor'),
  ('Bainbridge Island - Lynwood Center'),
  ('Bainbridge Island - Manzanita'),
  ('Bainbridge Island - Rolling Bay'),
  ('Bainbridge Island - Winslow'),

-- ============================================================
-- TACOMA neighborhoods
-- ============================================================
  ('Tacoma - Central'),
  ('Tacoma - East Side'),
  ('Tacoma - Fern Hill'),
  ('Tacoma - Hilltop'),
  ('Tacoma - Jefferson'),
  ('Tacoma - Lincoln'),
  ('Tacoma - McKinley'),
  ('Tacoma - New Tacoma'),
  ('Tacoma - North End'),
  ('Tacoma - Northeast Tacoma'),
  ('Tacoma - Old Town'),
  ('Tacoma - Point Defiance'),
  ('Tacoma - Proctor District'),
  ('Tacoma - South End'),
  ('Tacoma - South Tacoma'),
  ('Tacoma - Stadium District'),
  ('Tacoma - Sunset'),
  ('Tacoma - West End'),

-- ============================================================
-- GIG HARBOR neighborhoods
-- ============================================================
  ('Gig Harbor - Downtown'),
  ('Gig Harbor - Fox Island'),
  ('Gig Harbor - Peninsula'),
  ('Gig Harbor - Rosedale'),

-- ============================================================
-- PUYALLUP neighborhoods
-- ============================================================
  ('Puyallup - Downtown'),
  ('Puyallup - East Hill'),
  ('Puyallup - Fruitland'),
  ('Puyallup - North Hill'),
  ('Puyallup - South Hill'),

-- ============================================================
-- OLYMPIA neighborhoods
-- ============================================================
  ('Olympia - Bigelow'),
  ('Olympia - Capitol Campus'),
  ('Olympia - Downtown'),
  ('Olympia - Eastside'),
  ('Olympia - Garfield'),
  ('Olympia - Westside'),

-- ============================================================
-- BELLINGHAM neighborhoods
-- ============================================================
  ('Bellingham - Birchwood'),
  ('Bellingham - Columbia'),
  ('Bellingham - Downtown'),
  ('Bellingham - Edgemoor'),
  ('Bellingham - Fairhaven'),
  ('Bellingham - Fountain District'),
  ('Bellingham - Happy Valley'),
  ('Bellingham - Lettered Streets'),
  ('Bellingham - Meridian'),
  ('Bellingham - Sehome'),
  ('Bellingham - South Hill'),
  ('Bellingham - Whatcom Falls'),
  ('Bellingham - York'),

-- ============================================================
-- SPOKANE neighborhoods
-- ============================================================
  ('Spokane - Browne''s Addition'),
  ('Spokane - Chief Garry'),
  ('Spokane - Downtown'),
  ('Spokane - East Central'),
  ('Spokane - Emerson-Garfield'),
  ('Spokane - Five Mile Prairie'),
  ('Spokane - Hillyard'),
  ('Spokane - Indian Trail'),
  ('Spokane - Latah Valley'),
  ('Spokane - Lincoln Heights'),
  ('Spokane - Logan'),
  ('Spokane - Manito'),
  ('Spokane - Northside'),
  ('Spokane - Perry'),
  ('Spokane - Rockwood'),
  ('Spokane - Shadle Park'),
  ('Spokane - South Hill'),
  ('Spokane - University District'),
  ('Spokane - West Central')

ON CONFLICT (label) DO NOTHING;

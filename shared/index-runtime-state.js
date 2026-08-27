const UAE_DISTRICTS = {
  dubai: ["Dubai Marina","Palm Jumeirah","Downtown Dubai","Business Bay","Jumeirah Village Circle","Jumeirah Lake Towers","Dubai Hills Estate","Arabian Ranches","Emirates Hills","The Springs","The Meadows","Al Barsha","Deira","Bur Dubai","Damac Hills","Dubai Creek Harbour","Emaar Beachfront","Mirdif","Al Furjan","Discovery Gardens","Motor City","Dubai Sports City","Dubai Silicon Oasis","International City","Al Nahda","Al Qusais","Al Karama","Bluewaters Island","City Walk","DIFC","Dubai South","Jumeirah Beach Residence","La Mer","Mohammed Bin Rashid City","Palm Jebel Ali","Port de La Mer","Sobha Hartland","The Greens","Tilal Al Ghaf","Al Warqa"]
};
const FALLBACK_COORDS = {
  'dubai marina': { lat: 25.0802, lng: 55.1416 },
  'palm jumeirah': { lat: 25.1181, lng: 55.1425 },
  'downtown dubai': { lat: 25.1972, lng: 55.2741 },
  'business bay': { lat: 25.1855, lng: 55.2604 },
  'jumeirah village circle': { lat: 25.0551, lng: 55.2057 },
  'jumeirah lake towers': { lat: 25.0700, lng: 55.1400 },
  'dubai hills estate': { lat: 25.0900, lng: 55.2300 },
  'arabian ranches': { lat: 25.0556, lng: 55.2531 },
  'emirates hills': { lat: 25.0677, lng: 55.1691 },
  'the springs': { lat: 25.0700, lng: 55.2100 },
  'the meadows': { lat: 25.0600, lng: 55.2200 },
  'al barsha': { lat: 25.1166, lng: 55.1953 },
  'deira': { lat: 25.2700, lng: 55.3100 },
  'bur dubai': { lat: 25.2500, lng: 55.3100 },
  'damac hills': { lat: 25.0200, lng: 55.2700 },
  'dubai creek harbour': { lat: 25.2078, lng: 55.3350 },
  'emaar beachfront': { lat: 25.0850, lng: 55.1300 },
  'mirdif': { lat: 25.2370, lng: 55.4100 },
  'al furjan': { lat: 25.0322, lng: 55.1511 },
  'discovery gardens': { lat: 25.0500, lng: 55.1600 },
  'motor city': { lat: 25.0350, lng: 55.3000 },
  'dubai sports city': { lat: 25.0300, lng: 55.2900 },
  'dubai silicon oasis': { lat: 25.1296, lng: 55.3750 },
  'international city': { lat: 25.2100, lng: 55.4300 },
  'al nahda': { lat: 25.2800, lng: 55.3700 },
  'al qusais': { lat: 25.2700, lng: 55.3900 },
  'al karama': { lat: 25.2300, lng: 55.3000 },
  'bluewaters island': { lat: 25.0800, lng: 55.1200 },
  'city walk': { lat: 25.2100, lng: 55.2700 },
  'dubai south': { lat: 24.9500, lng: 55.1500 },
  'jumeirah beach residence': { lat: 25.0780, lng: 55.1340 },
  'la mer': { lat: 25.2200, lng: 55.2600 },
  'mohammed bin rashid city': { lat: 25.1150, lng: 55.3650 },
  'palm jebel ali': { lat: 25.0800, lng: 55.0200 },
  'sobha hartland': { lat: 25.1900, lng: 55.3000 },
  'the greens': { lat: 25.1100, lng: 55.2100 },
  'tilal al ghaf': { lat: 25.0800, lng: 55.3500 },
  'al warqa': { lat: 25.2600, lng: 55.4200 }
};
let districtCoordsMap = {};
let resolvedDistrictCoords = {};
let districtResolveRequestId = 0;
let scrapedDistrictData = null, gisData = null, gisLoading = false, gisFetchTimeout = null, gisRequestId = 0, gisAbortController = null;
let marketIntelligenceData = null;
let dldTransactionsCache = [];
let projectBuildingSummary = null;
let selectedProjectBuilding = '';
let currentEvidenceState = AQAR_EVIDENCE_STATE.STATES.INSUFFICIENT;
let gisMapInstance = null, gisMarker = null, gisCircleLayer = null, projectMapLabelMarker = null, poiMarkers = [], mapInitialized = false, dubaiDistrictsList = [];
// Centroid matching is deliberately conservative: an unknown point must not inherit a distant DLD district.
const MAP_DISTRICT_MATCH_MAX_KM = 1.5;

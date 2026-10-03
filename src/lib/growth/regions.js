// Where to look for clinics on OpenStreetMap.
//
// Governorates search inside their official OSM boundary (relation ids below,
// read from OSM in Oct 2026 — admin_level 4 in Egypt). Egyptian districts have
// no drawn boundaries on OSM and their place names are patchy, so the areas
// are a hand-kept list of well-known districts with an approximate centre;
// those search a circle around the centre (radius chosen on screen).

export const GOVERNORATES = [
  { key: 'cairo', name: 'القاهرة', relationId: 4103336 },
  { key: 'giza', name: 'الجيزة', relationId: 3824206 },
  { key: 'alexandria', name: 'الإسكندرية', relationId: 3061846 },
  { key: 'qalyubia', name: 'القليوبية', relationId: 4103337 },
  { key: 'dakahlia', name: 'الدقهلية', relationId: 4103403 },
  { key: 'sharqia', name: 'الشرقية', relationId: 4103407 },
  { key: 'gharbia', name: 'الغربية', relationId: 3584607 },
  { key: 'monufia', name: 'المنوفية', relationId: 3824207 },
  { key: 'beheira', name: 'البحيرة', relationId: 3824513 },
  { key: 'kafr_el_sheikh', name: 'كفر الشيخ', relationId: 4103405 },
  { key: 'damietta', name: 'دمياط', relationId: 4103404 },
  { key: 'port_said', name: 'بورسعيد', relationId: 4103406 },
  { key: 'ismailia', name: 'الإسماعيلية', relationId: 3062184 },
  { key: 'suez', name: 'السويس', relationId: 3062185 },
  { key: 'fayoum', name: 'الفيوم', relationId: 3726124 },
  { key: 'beni_suef', name: 'بني سويف', relationId: 3726170 },
  { key: 'minya', name: 'المنيا', relationId: 3726175 },
  { key: 'assiut', name: 'أسيوط', relationId: 3726184 },
  { key: 'sohag', name: 'سوهاج', relationId: 3726186 },
  { key: 'qena', name: 'قنا', relationId: 3726189 },
  { key: 'luxor', name: 'الأقصر', relationId: 3726211 },
  { key: 'aswan', name: 'أسوان', relationId: 3061757 },
  { key: 'red_sea', name: 'البحر الأحمر', relationId: 3061758 },
  { key: 'matrouh', name: 'مطروح', relationId: 3061826 },
  { key: 'new_valley', name: 'الوادي الجديد', relationId: 3061827 },
  { key: 'north_sinai', name: 'شمال سيناء', relationId: 3060792 },
  { key: 'south_sinai', name: 'جنوب سيناء', relationId: 3060793 },
]

// Approximate district centres [lat, lon].
export const AREAS = {
  cairo: [
    ['مدينة نصر', 30.0566, 31.3301],
    ['مصر الجديدة', 30.0910, 31.3226],
    ['النزهة وشيراتون', 30.1050, 31.3700],
    ['المعادي', 29.9602, 31.2569],
    ['التجمع الخامس', 30.0074, 31.4913],
    ['الرحاب', 30.0583, 31.4910],
    ['الشروق', 30.1500, 31.6300],
    ['مدينتي', 30.0950, 31.6400],
    ['القطامية', 29.9900, 31.4200],
    ['المقطم', 30.0118, 31.3008],
    ['الزمالك', 30.0626, 31.2197],
    ['وسط البلد', 30.0478, 31.2386],
    ['جاردن سيتي', 30.0359, 31.2316],
    ['السيدة زينب', 30.0300, 31.2400],
    ['العباسية', 30.0700, 31.2800],
    ['حدائق القبة', 30.0880, 31.2830],
    ['الزيتون', 30.1050, 31.3100],
    ['شبرا', 30.0928, 31.2453],
    ['عين شمس', 30.1310, 31.3290],
    ['المرج', 30.1530, 31.3380],
    ['حلوان', 29.8500, 31.3340],
  ],
  giza: [
    ['الدقي', 30.0380, 31.2110],
    ['المهندسين', 30.0560, 31.2000],
    ['العجوزة', 30.0570, 31.2100],
    ['إمبابة', 30.0750, 31.2050],
    ['بولاق الدكرور', 30.0350, 31.1850],
    ['الجيزة (وسط)', 30.0130, 31.2090],
    ['المنيب', 29.9800, 31.2100],
    ['الهرم', 29.9950, 31.1500],
    ['فيصل', 30.0050, 31.1700],
    ['حدائق الأهرام', 29.9700, 31.1000],
    ['6 أكتوبر', 29.9600, 30.9300],
    ['الشيخ زايد', 30.0420, 30.9800],
  ],
  alexandria: [
    ['محطة الرمل', 31.2010, 29.9000],
    ['سموحة', 31.2156, 29.9420],
    ['سيدي جابر', 31.2190, 29.9420],
    ['جليم وسان ستيفانو', 31.2430, 29.9650],
    ['سيدي بشر', 31.2580, 29.9850],
    ['ميامي', 31.2680, 30.0000],
    ['المندرة', 31.2810, 30.0170],
    ['العجمي', 31.0950, 29.7700],
  ],
}

export const RADIUS_OPTIONS = [2, 3, 5]

export const governorateByKey = (key) => GOVERNORATES.find((g) => g.key === key)
export const areasFor = (key) => (AREAS[key] ?? []).map(([name, lat, lon]) => ({ name, lat, lon }))

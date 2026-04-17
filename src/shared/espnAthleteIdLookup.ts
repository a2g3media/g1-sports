/**
 * Curated ESPN athlete id map (numeric) for navigation when APIs return names/slugs only.
 * Used by player photos, profile navigation, and worker props enrichment — not live ESPN API calls.
 */
export const ESPN_PLAYER_IDS: Record<string, string> = {
  // ===== NBA =====
  'giannis antetokounmpo': '3032977',
  'shai gilgeous-alexander': '4278073',
  'luka dončić': '3945274',
  'luka doncic': '3945274',
  'nikola jokić': '3112335',
  'nikola jokic': '3112335',
  'jayson tatum': '4065648',
  'joel embiid': '3059318',
  'kevin durant': '3202',
  'devin booker': '3136193',
  'anthony edwards': '4594268',
  'donovan mitchell': '4066421',
  'davion mitchell': '4278053',
  'damian lillard': '6606',
  'jaylen brown': '3917376',
  'de\'aaron fox': '4066259',
  'jalen brunson': '3934672',
  'lamelo ball': '4432573',
  'paolo banchero': '4433134',
  'victor wembanyama': '5104157',
  'tyrese maxey': '4432816',
  'rudy gobert': '3032976',
  'evan mobley': '4432166',
  'anthony davis': '6583',
  'domantas sabonis': '3155526',
  'jarrett allen': '4066336',
  'tyrese haliburton': '4433218',
  'trae young': '4277905',
  'lebron james': '1966',
  'james harden': '3992',
  'stephen curry': '3975',
  'chris paul': '2779',
  'darius garland': '4395725',
  'cade cunningham': '4432158',
  'kawhi leonard': '6450',
  'paul george': '4251',
  'norman powell': '2528779',
  'ivica zubac': '4348490',
  'josh giddey': '4871145',
  'coby white': '4395651',
  'nikola vucevic': '6478',
  'zach lavine': '3064440',
  'demar derozan': '3978',
  'lonzo ball': '4066422',
  'austin reaves': '4066457',
  'dangelo russell': '3136776',
  'rui hachimura': '4397077',
  'gabe vincent': '3136779',
  'jarred vanderbilt': '4277813',
  'cam reddish': '4065647',
  'zach collins': '4278061',
  'alex caruso': '2991350',
  'jamal murray': '3936299',
  'michael porter jr': '4278104',
  'aaron gordon': '3064290',
  'russell westbrook': '3468',
  'nikola jovic': '4701238',
  'jimmy butler': '6430',
  'bam adebayo': '4066261',
  'tyler herro': '4395725',
  'duncan robinson': '3157465',
  'kristaps porzingis': '3102531',
  'jrue holiday': '3995',
  'derrick white': '4237532',
  'al horford': '3213',
  'jalen williams': '4593803',
  'chet holmgren': '4433255',
  'isaiah hartenstein': '4222252',
  'jaylin williams': '4433226',
  'julius randle': '3064514',
  'karl anthony towns': '3136195',
  'donte divincenzo': '3934673',
  'og anunoby': '3934719',
  'mitchell robinson': '4351852',
  'josh hart': '3062679',
  'desmond bane': '4066320',
  'ja morant': '4279888',
  'jaren jackson jr': '4277961',
  'brandon clarke': '4277928',
  'deaaron fox': '4066259',
  'keegan murray': '4895743',
  'malik monk': '4066262',
  'kevin huerter': '4066372',
  'bradley beal': '6580',
  'jusuf nurkic': '2999547',
  'grayson allen': '3135045',
  'kyrie irving': '6442',
  'pj washington': '4278078',
  'derrick lively ii': '5104848',
  'daniel gafford': '4278074',
  'klay thompson': '6475',
  'amen thompson': '5105606',
  'fred vanvleet': '2991230',
  'alperen sengun': '4871144',
  'jalen green': '4437244',
  'jabari smith jr': '4433071',
  'tobias harris': '6440',
  'jalen duren': '4433138',
  'jaden ivey': '4433215',
  'franz wagner': '4566434',
  'wendell carter jr': '4277919',
  'cole anthony': '4432809',
  'deandre hunter': '4065732',
  'bogdan bogdanovic': '3037789',
  'dyson daniels': '4701236',
  'zion williamson': '4395628',
  'immanuel quickley': '4395724',
  'scottie barnes': '4433134',
  'rj barrett': '4395625',
  'rj barreet': '4395625',
  'trey murphy': '4397688',
  'trey murphy iii': '4397688',
  'dejounte murray': '3907497',
  'djounte murray': '3907497',
  'herbert jones': '4277813',
  'brandon ingram': '3913176',
  'cj mccollum': '2490149',
  'jonas valanciunas': '6477',
  'draymond green': '6589',
  'andrew wiggins': '3059319',
  'jonathan kuminga': '4433247',
  'terance mann': '4277923',
  'deandre ayton': '4278129',
  'jerami grant': '2991070',
  'anfernee simons': '4351851',
  'scoot henderson': '5104863',
  'lauri markkanen': '4066336',
  'collin sexton': '4277813',
  'john collins': '3908809',
  'walker kessler': '4432743',
  'khris middleton': '6609',
  'brook lopez': '3448',
  'kadary richmond': '4701845',
  'k richmond': '4701845',
  'richmond': '4701845',
  
  // ===== MLB =====
  'luis arraez': '39836',
  'shohei ohtani': '39832',
  'juan soto': '41188',
  'aaron judge': '33192',
  'mookie betts': '33039',
  'ronald acuña jr.': '41074',
  'ronald acuna jr': '41074',
  'adolis garcía': '41116',
  'adolis garcia': '41116',
  'kyle schwarber': '36137',
  'paul goldschmidt': '31027',
  'matt olson': '39156',
  'corey seager': '36893',
  'freddie freeman': '30193',
  'jose ramirez': '34889',
  'trea turner': '35015',
  'mike trout': '30836',
  'bryce harper': '39693',
  'fernando tatis jr.': '41192',
  'vladimir guerrero jr.': '41146',
  
  // ===== NHL =====
  'connor mcdavid': '3895074',
  'leon draisaitl': '3114727',
  'nikita kucherov': '3041969',
  'nathan mackinnon': '3041970',
  'auston matthews': '4024123',
  'david pastrnak': '3899937',
  'cale makar': '4352759',
  'jack eichel': '3900173',
  'matthew tkachuk': '4024124',
  'mitch marner': '4024121',
  'artemi panarin': '3151064',
  'mikko rantanen': '3899961',
  'kirill kaprizov': '4024125',
  'jason robertson': '4565231',
  'sidney crosby': '3114',
  'alex ovechkin': '3101',
  
  // ===== NFL =====
  'patrick mahomes': '3139477',
  'josh allen': '3918298',
  'lamar jackson': '3916387',
  'jalen hurts': '4040715',
  'joe burrow': '3915511',
  'tua tagovailoa': '4241479',
  'cj stroud': '4432577',
  'dak prescott': '2577417',
  'jordan love': '4360438',
  'brock purdy': '4361741',
  'derrick henry': '3043078',
  'saquon barkley': '3929630',
  'jahmyr gibbs': '4426354',
  'breece hall': '4362628',
  'bijan robinson': '4426348',
  'ceedee lamb': '4241389',
  'tyreek hill': '3116406',
  'ja\'marr chase': '4362887',
  'amon-ra st. brown': '4360939',
  'davante adams': '2976212',
  'puka nacua': '4428331',
  'devon achane': '4429160',
  'de\'von achane': '4429160',

  // ===== NHL goalies (hub mocks) =====
  'igor shesterkin': '3899932',
  'thatcher demko': '3114720',
  'ilya sorokin': '3899934',
  'andrei vasilevskiy': '3114725',
  'jake oettinger': '4565234',
  'connor hellebuyck': '3042109',
  'steven stamkos': '3114',

  // ===== NCAAB (hub / leaders mocks) =====
  'zach edey': '4600663',
  'hunter dickinson': '4432180',
  'johnell davis': '4702655',
  'rj davis': '4433176',
  'mark sears': '4703530',
  'tyler kolek': '4433225',
  'boo buie': '4592712',
  'dug mcdaniel': '4432183',
  'trey alexander': '4701234',
  'tristen newton': '4432185',
  'ryan kalkbrenner': '4432186',
  'jamarion sharp': '4701845',
  'donovan clingan': '4433138',
  'ugonna onyenso': '4701846',
  'dalton knecht': '4897943',
  'terrence shannon jr.': '4395625',
  'cam spencer': '4432816',
  'gradey dick': '4432573',
  'kyle filipowski': '4684793',
  'kel\'el ware': '4433138',
  'marcus sasser': '4432187',
  'jarace walker': '4432188',
  'stephon castle': '4432189',
  'aj storr': '5105603',
  'dj horne': '4431993',

  // ===== Golf =====
  'scottie scheffler': '9478',
  'rory mcilroy': '3470',
  'jon rahm': '9780',
  'brooks koepka': '6798',
  'justin thomas': '9256',
  'viktor hovland': '10592',
  'collin morikawa': '10592',
  'xander schauffele': '9521',
  'jordan spieth': '5467',
  'dustin johnson': '3448',
  'tiger woods': '462',
  'tony finau': '2230',
  'davis thompson': '4602218',
  'd thompson': '4602218',
  'd. thompson': '4602218',
  't. finau': '2230',
  't finau': '2230',
  
  // ===== MMA =====
  'islam makhachev': '3087623',
  'jon jones': '2335185',
  'alex pereira': '4285892',
  'dricus du plessis': '4575311',
  'ilia topuria': '4545893',
  'alexandre pantoja': '3153235',
  'sean strickland': '3093212',
  'tom aspinall': '4351875',
};

const GOLF_LAST_NAME_IDS: Record<string, string> = {
  scheffler: '9478',
  mcilroy: '3470',
  rahm: '9780',
  koepka: '6798',
  thomas: '9256',
  hovland: '10592',
  morikawa: '10592',
  schauffele: '9521',
  spieth: '5467',
  johnson: '3448',
  woods: '462',
  finau: '2230',
  thompson: '4602218',
};

function stripNameDecorators(input: string): string {
  return String(input || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s[+-]\d+(\.\d+)?\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePlayerKey(name: string): string {
  const trimmed = stripNameDecorators(name);
  const reordered = trimmed.includes(',')
    ? (() => {
        const [last, first] = trimmed.split(',', 2).map((part) => part.trim());
        return first && last ? `${first} ${last}` : trimmed;
      })()
    : trimmed;

  return reordered
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_ESPN_PLAYER_IDS: Record<string, string> = Object.entries(ESPN_PLAYER_IDS).reduce(
  (acc, [name, id]) => {
    acc[normalizePlayerKey(name)] = id;
    return acc;
  },
  {} as Record<string, string>
);

export function buildPlayerLookupKeys(playerName: string): string[] {
  const trimmed = stripNameDecorators(playerName);
  const reordered = trimmed.includes(',')
    ? (() => {
        const [last, first] = trimmed.split(',', 2).map((part) => part.trim());
        return first && last ? `${first} ${last}` : trimmed;
      })()
    : trimmed;
  const raw = reordered.toLowerCase().trim();
  const normalized = normalizePlayerKey(playerName);
  const noMiddleInitial = normalized.replace(/\b[a-z]\b/g, '').replace(/\s+/g, ' ').trim();
  const noSuffixDots = raw.replace(/[.,]/g, '');

  return Array.from(new Set([raw, noSuffixDots, normalized, noMiddleInitial])).filter(Boolean);
}

function resolveGolfFallbackId(playerName: string): string | undefined {
  const normalized = normalizePlayerKey(playerName);
  if (!normalized) return undefined;
  const parts = normalized.split(' ').filter(Boolean);
  const lastName = parts[parts.length - 1];
  if (!lastName) return undefined;
  return GOLF_LAST_NAME_IDS[lastName];
}

/** Numeric ESPN athlete id for routing (4+ digits), or undefined. */
export function getEspnAthleteIdForPlayerName(playerName: string, sport: string = "nba"): string | undefined {
  const lookupKeys = buildPlayerLookupKeys(playerName);
  let espnId: string | undefined;
  for (const key of lookupKeys) {
    espnId = ESPN_PLAYER_IDS[key] || NORMALIZED_ESPN_PLAYER_IDS[key];
    if (espnId) break;
  }
  if (!espnId && sport.toLowerCase() === "golf") {
    espnId = resolveGolfFallbackId(playerName);
  }
  if (!espnId) return undefined;
  return /^\d{4,}$/.test(espnId) ? espnId : undefined;
}

/**
 * Canonical numeric id for routes: prefer API `rawId` when already valid, else curated name→id for the sport.
 */
export function resolveCanonicalPlayerIdFromPayload(
  rawId: unknown,
  displayName: string | undefined,
  sportKey: string = "nba"
): string | undefined {
  const s = String(rawId ?? "").trim();
  if (/^\d{4,}$/.test(s)) return s;
  if (!displayName?.trim()) return undefined;
  return getEspnAthleteIdForPlayerName(displayName.trim(), sportKey.toLowerCase());
}

export function addPlayerMapping(playerName: string, espnId: string): void {
  const key = playerName.toLowerCase().trim();
  ESPN_PLAYER_IDS[key] = espnId;
  NORMALIZED_ESPN_PLAYER_IDS[normalizePlayerKey(playerName)] = espnId;
}

export function hasEspnAthletePhotoMapping(playerName: string): boolean {
  const lookupKeys = buildPlayerLookupKeys(playerName);
  return lookupKeys.some((k) => Boolean(ESPN_PLAYER_IDS[k] || NORMALIZED_ESPN_PLAYER_IDS[k]));
}

const ESPN_HEADSHOT_BASE = "https://a.espncdn.com/combiner/i?img=/i/headshots";

const SPORT_PATHS: Record<string, string> = {
  nba: "nba",
  nfl: "nfl",
  mlb: "mlb",
  nhl: "nhl",
  ncaab: "mens-college-basketball",
  ncaaf: "college-football",
  golf: "golf",
  soccer: "soccer",
  mma: "mma",
};

/**
 * ESPN headshot URL candidates (same order as legacy PlayerPhoto: proxied first).
 */
export function getPlayerPhotoUrls(
  playerName: string,
  sport: string = "nba",
  size: "small" | "medium" | "large" = "medium"
): string[] {
  const lookupKeys = buildPlayerLookupKeys(playerName);
  let espnId: string | undefined;
  for (const key of lookupKeys) {
    espnId = ESPN_PLAYER_IDS[key] || NORMALIZED_ESPN_PLAYER_IDS[key];
    if (espnId) break;
  }
  if (!espnId && sport.toLowerCase() === "golf") {
    espnId = resolveGolfFallbackId(playerName);
  }
  if (!espnId) return [];

  const sportPath = SPORT_PATHS[sport.toLowerCase()] || "nba";
  const dimensions =
    size === "small" ? "w=48&h=35" : size === "large" ? "w=160&h=120" : "w=96&h=70";
  const combinerUrl = `${ESPN_HEADSHOT_BASE}/${sportPath}/players/full/${espnId}.png&${dimensions}&cb=1`;
  const directUrl = `https://a.espncdn.com/i/headshots/${sportPath}/players/full/${espnId}.png`;
  const proxiedCombinerUrl = `/api/media/player-photo?url=${encodeURIComponent(combinerUrl)}`;
  const proxiedDirectUrl = `/api/media/player-photo?url=${encodeURIComponent(directUrl)}`;

  return [proxiedCombinerUrl, proxiedDirectUrl, combinerUrl, directUrl];
}

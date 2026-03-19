/**
 * CENTRALIZED PLAYER PHOTO COMPONENT
 * Single source of truth for player photos across the entire app.
 * Uses ESPN CDN for major sports with comprehensive ID mappings.
 */

import { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

// ESPN CDN base URL pattern
const ESPN_HEADSHOT_BASE = 'https://a.espncdn.com/combiner/i?img=/i/headshots';

// Sport-specific paths for ESPN CDN
const SPORT_PATHS: Record<string, string> = {
  nba: 'nba',
  nfl: 'nfl',
  mlb: 'mlb',
  nhl: 'nhl',
  ncaab: 'mens-college-basketball',
  ncaaf: 'college-football',
  golf: 'golf',
  soccer: 'soccer',
  mma: 'mma',
};

// Comprehensive ESPN player ID mappings
// Add new players here as needed
const ESPN_PLAYER_IDS: Record<string, string> = {
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
  'austin reaves': '4066450',
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

function normalizePlayerKey(name: string): string {
  const trimmed = name.trim();
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

function buildPlayerLookupKeys(playerName: string): string[] {
  const trimmed = playerName.trim();
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

function buildInitialsAvatarDataUri(name: string): string {
  const safe = (name || "Player").trim();
  const initials = safe
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 3)
    .toUpperCase() || "P";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#e2e8f0" font-size="92" font-family="Arial, sans-serif" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Get ESPN player photo URL
 */
export function getPlayerPhotoUrl(
  playerName: string,
  sport: string = 'nba',
  size: 'small' | 'medium' | 'large' = 'medium'
): string | null {
  const lookupKeys = buildPlayerLookupKeys(playerName);
  let espnId: string | undefined;
  for (const key of lookupKeys) {
    espnId = ESPN_PLAYER_IDS[key] || NORMALIZED_ESPN_PLAYER_IDS[key];
    if (espnId) break;
  }
  
  if (!espnId) return null;
  
  const sportPath = SPORT_PATHS[sport.toLowerCase()] || 'nba';
  const dimensions = size === 'small' ? 'w=48&h=35' : size === 'large' ? 'w=160&h=120' : 'w=96&h=70';
  
  return `${ESPN_HEADSHOT_BASE}/${sportPath}/players/full/${espnId}.png&${dimensions}&cb=1`;
}

// Fallback silhouette component
function PlayerSilhouette({ 
  size,
  highlight,
  className,
}: { 
  size: number;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-full",
        highlight 
          ? "bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-500/50" 
          : "bg-white/10 text-white/30",
        className
      )}
      style={{ width: size, height: size }}
    >
      <User className="w-1/2 h-1/2" />
    </div>
  );
}

export interface PlayerPhotoProps {
  /** Player full name (e.g., 'LeBron James') */
  playerName: string;
  /** Sport code: nba, nfl, mlb, nhl, golf, mma */
  sport?: string;
  /** Size in pixels (default: 48) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Highlight styling for top players */
  highlight?: boolean;
  /** Show border ring */
  showRing?: boolean;
  /** Custom ring color */
  ringColor?: string;
}

export function PlayerPhoto({
  playerName,
  sport = 'nba',
  size = 48,
  className,
  highlight = false,
  showRing = false,
  ringColor = 'ring-white/20',
}: PlayerPhotoProps) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  
  const photoSize = size < 60 ? 'small' : size > 100 ? 'large' : 'medium';
  const photoUrl = getPlayerPhotoUrl(playerName, sport, photoSize);
  const avatarUrl = useMemo(() => {
    return buildInitialsAvatarDataUri(playerName || 'Player');
  }, [playerName]);
  const candidateUrls = useMemo(
    () => [photoUrl, avatarUrl].filter((url): url is string => Boolean(url)),
    [photoUrl, avatarUrl]
  );

  useEffect(() => {
    setAttemptIndex(0);
  }, [playerName, sport, size]);
  
  if (candidateUrls.length === 0) {
    return (
      <PlayerSilhouette 
        size={size} 
        highlight={highlight}
        className={className}
      />
    );
  }
  
  return (
    <img
      src={candidateUrls[Math.min(attemptIndex, candidateUrls.length - 1)]}
      alt={playerName}
      className={cn(
        "object-cover object-top rounded-full",
        showRing && `ring-2 ${ringColor}`,
        highlight && "ring-2 ring-amber-500/30",
        className
      )}
      style={{ width: size, height: size }}
      onError={() => {
        setAttemptIndex((prev) => Math.min(prev + 1, candidateUrls.length - 1));
      }}
      loading="lazy"
    />
  );
}

/**
 * Compact player photo for lists and tables
 */
export function PlayerPhotoCompact({
  playerName,
  sport,
  className,
  highlight,
}: Omit<PlayerPhotoProps, 'size' | 'showRing' | 'ringColor'>) {
  return (
    <PlayerPhoto
      playerName={playerName}
      sport={sport}
      size={32}
      className={className}
      highlight={highlight}
    />
  );
}

/**
 * Large player photo for profile pages and heroes
 */
export function PlayerPhotoLarge({
  playerName,
  sport,
  className,
  highlight,
}: Omit<PlayerPhotoProps, 'size'>) {
  return (
    <PlayerPhoto
      playerName={playerName}
      sport={sport}
      size={120}
      showRing={true}
      className={className}
      highlight={highlight}
    />
  );
}

/**
 * Check if we have a photo for a player
 */
export function hasPlayerPhoto(playerName: string): boolean {
  const lookupKeys = buildPlayerLookupKeys(playerName);
  return lookupKeys.some((key) => Boolean(ESPN_PLAYER_IDS[key] || NORMALIZED_ESPN_PLAYER_IDS[key]));
}

/**
 * Add a player ID to the mapping (for runtime additions)
 */
export function addPlayerMapping(playerName: string, espnId: string): void {
  const key = playerName.toLowerCase().trim();
  ESPN_PLAYER_IDS[key] = espnId;
  NORMALIZED_ESPN_PLAYER_IDS[normalizePlayerKey(playerName)] = espnId;
}

export default PlayerPhoto;

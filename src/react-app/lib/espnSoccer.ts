/**
 * ESPN Soccer Assets - Team Logos and Player Photos
 * 
 * ESPN team IDs for major European leagues.
 * Logo URL format: https://a.espncdn.com/i/teamlogos/soccer/500/{espn_team_id}.png
 * Player URL format: https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/{espn_player_id}.png
 */

// ESPN Team ID Mappings by SportsRadar competitor ID
// Format: 'sr:competitor:{id}' -> ESPN team ID
const ESPN_TEAM_IDS: Record<string, string> = {
  // ==========================================================================
  // PREMIER LEAGUE (England)
  // ==========================================================================
  'sr:competitor:42': '359',   // Arsenal
  'sr:competitor:30': '333',   // Aston Villa
  'sr:competitor:60': '337',   // Bournemouth
  'sr:competitor:50': '331',   // Brentford
  'sr:competitor:46': '348',   // Brighton
  'sr:competitor:38': '363',   // Chelsea
  'sr:competitor:7': '384',    // Crystal Palace
  'sr:competitor:48': '368',   // Everton
  'sr:competitor:36': '370',   // Fulham
  'sr:competitor:43': '373',   // Ipswich Town
  'sr:competitor:31': '375',   // Leicester City
  'sr:competitor:44': '364',   // Liverpool
  'sr:competitor:17': '382',   // Manchester City
  'sr:competitor:35': '360',   // Manchester United
  'sr:competitor:39': '361',   // Newcastle United
  'sr:competitor:14': '393',   // Nottingham Forest
  'sr:competitor:45': '379',   // Southampton
  'sr:competitor:33': '367',   // Tottenham Hotspur
  'sr:competitor:37': '383',   // West Ham United
  'sr:competitor:3': '380',    // Wolverhampton
  
  // ==========================================================================
  // LA LIGA (Spain)
  // ==========================================================================
  'sr:competitor:2816': '83',    // Real Madrid
  'sr:competitor:2817': '83',    // Barcelona (alternate)
  'sr:competitor:2820': '81',    // Atletico Madrid
  'sr:competitor:2828': '243',   // Sevilla
  'sr:competitor:2826': '94',    // Real Sociedad
  'sr:competitor:2829': '84',    // Valencia
  'sr:competitor:2831': '102',   // Villarreal
  'sr:competitor:2825': '93',    // Athletic Bilbao
  'sr:competitor:2832': '95',    // Real Betis
  'sr:competitor:2833': '87',    // Celta Vigo
  'sr:competitor:2834': '97',    // Osasuna
  'sr:competitor:2827': '98',    // Getafe
  'sr:competitor:2821': '88',    // Espanyol
  'sr:competitor:2835': '90',    // Mallorca
  'sr:competitor:2836': '92',    // Rayo Vallecano
  'sr:competitor:2822': '86',    // Alaves
  'sr:competitor:2823': '99',    // Las Palmas
  'sr:competitor:2837': '8315',  // Girona
  'sr:competitor:2824': '101',   // Valladolid
  'sr:competitor:2830': '244',   // Leganes
  
  // ==========================================================================
  // SERIE A (Italy)
  // ==========================================================================
  'sr:competitor:2687': '111',  // Juventus
  'sr:competitor:2688': '103',  // AC Milan
  'sr:competitor:2689': '110',  // Inter Milan
  'sr:competitor:2686': '104',  // Napoli
  'sr:competitor:2692': '107',  // Roma
  'sr:competitor:2693': '105',  // Lazio
  'sr:competitor:2695': '109',  // Fiorentina
  'sr:competitor:2696': '106',  // Atalanta
  'sr:competitor:2694': '108',  // Torino
  'sr:competitor:2697': '113',  // Bologna
  'sr:competitor:2699': '116',  // Udinese
  'sr:competitor:2698': '114',  // Sassuolo
  'sr:competitor:2702': '115',  // Empoli
  'sr:competitor:2700': '112',  // Genoa
  'sr:competitor:2703': '117',  // Verona
  'sr:competitor:2701': '3366', // Lecce
  'sr:competitor:2691': '119',  // Cagliari
  'sr:competitor:2704': '3375', // Monza
  'sr:competitor:2690': '128',  // Parma
  'sr:competitor:2705': '3162', // Como
  
  // ==========================================================================
  // BUNDESLIGA (Germany)
  // ==========================================================================
  'sr:competitor:2672': '132',  // Bayern Munich
  'sr:competitor:2673': '124',  // Borussia Dortmund
  'sr:competitor:2676': '131',  // RB Leipzig
  'sr:competitor:2677': '125',  // Bayer Leverkusen
  'sr:competitor:2681': '134',  // Eintracht Frankfurt
  'sr:competitor:2675': '133',  // Wolfsburg
  'sr:competitor:2674': '127',  // Borussia Monchengladbach
  'sr:competitor:2682': '3057', // Union Berlin
  'sr:competitor:2683': '138',  // Freiburg
  'sr:competitor:2678': '140',  // Hoffenheim
  'sr:competitor:2679': '139',  // Mainz 05
  'sr:competitor:2680': '137',  // Werder Bremen
  'sr:competitor:2684': '136',  // Augsburg
  'sr:competitor:2685': '135',  // Stuttgart
  'sr:competitor:9789': '143',  // Bochum
  'sr:competitor:9790': '3055', // Heidenheim
  'sr:competitor:9791': '141',  // St. Pauli
  'sr:competitor:9792': '142',  // Holstein Kiel
  
  // ==========================================================================
  // LIGUE 1 (France)
  // ==========================================================================
  'sr:competitor:2847': '160',  // Paris Saint-Germain
  'sr:competitor:2850': '148',  // Monaco
  'sr:competitor:2848': '158',  // Marseille
  'sr:competitor:2849': '163',  // Lyon
  'sr:competitor:2851': '159',  // Lille
  'sr:competitor:2852': '161',  // Nice
  'sr:competitor:2853': '167',  // Rennes
  'sr:competitor:2854': '164',  // Lens
  'sr:competitor:2855': '162',  // Strasbourg
  'sr:competitor:2856': '165',  // Nantes
  'sr:competitor:2857': '166',  // Montpellier
  'sr:competitor:2858': '168',  // Toulouse
  'sr:competitor:2859': '169',  // Reims
  'sr:competitor:2860': '3058', // Brest
  'sr:competitor:2861': '170',  // Le Havre
  'sr:competitor:2862': '3096', // Angers
  'sr:competitor:2863': '171',  // Auxerre
  'sr:competitor:2864': '172',  // Saint-Etienne
  
  // ==========================================================================
  // CHAMPIONS LEAGUE / EUROPA LEAGUE (Additional European Clubs)
  // ==========================================================================
  'sr:competitor:2448': '86',   // Ajax
  'sr:competitor:2449': '174',  // PSV Eindhoven
  'sr:competitor:2451': '175',  // Feyenoord
  'sr:competitor:2430': '188',  // Porto
  'sr:competitor:2429': '187',  // Benfica
  'sr:competitor:2431': '183',  // Sporting CP
  'sr:competitor:2466': '209',  // Celtic
  'sr:competitor:2467': '210',  // Rangers
  'sr:competitor:2413': '225',  // Galatasaray
  'sr:competitor:2414': '226',  // Fenerbahce
  'sr:competitor:2415': '228',  // Besiktas
  'sr:competitor:2440': '189',  // Club Brugge
  'sr:competitor:2757': '130',  // Red Bull Salzburg
  'sr:competitor:2649': '197',  // Shakhtar Donetsk
  'sr:competitor:2359': '194',  // Olympiacos
  'sr:competitor:2361': '195',  // PAOK
  'sr:competitor:2371': '191',  // Dinamo Zagreb
  'sr:competitor:2643': '198',  // Dynamo Kyiv
  'sr:competitor:2712': '217',  // Slavia Prague
  'sr:competitor:2713': '218',  // Sparta Prague
  'sr:competitor:2379': '192',  // Ferencvaros
  'sr:competitor:2380': '190',  // Young Boys
  
  // ==========================================================================
  // MLS (USA)
  // ==========================================================================
  'sr:competitor:2078': '17',   // LA Galaxy
  'sr:competitor:2079': '21',   // Inter Miami
  'sr:competitor:2080': '18',   // LAFC
  'sr:competitor:2081': '19',   // Atlanta United
  'sr:competitor:2082': '6',    // Seattle Sounders
  'sr:competitor:2083': '9',    // NYCFC
  'sr:competitor:2084': '10',   // New York Red Bulls
  'sr:competitor:2085': '5',    // Portland Timbers
  'sr:competitor:2086': '7',    // Toronto FC
  'sr:competitor:2087': '11',   // Philadelphia Union
  'sr:competitor:2088': '12',   // FC Cincinnati
  'sr:competitor:2089': '4',    // Columbus Crew
  'sr:competitor:2090': '16',   // Austin FC
  'sr:competitor:2091': '3',    // Nashville SC
  'sr:competitor:2092': '2',    // Charlotte FC
  'sr:competitor:2093': '8',    // Sporting Kansas City
  'sr:competitor:2094': '13',   // Real Salt Lake
  'sr:competitor:2095': '14',   // Minnesota United
  'sr:competitor:2096': '15',   // Houston Dynamo
  'sr:competitor:2097': '1',    // DC United
  
  // ==========================================================================
  // LIGA MX (Mexico)
  // ==========================================================================
  'sr:competitor:2512': '219',  // Club America
  'sr:competitor:2513': '222',  // Chivas Guadalajara
  'sr:competitor:2514': '225',  // Cruz Azul
  'sr:competitor:2515': '221',  // UNAM Pumas
  'sr:competitor:2516': '227',  // Tigres UANL
  'sr:competitor:2517': '226',  // Monterrey
  'sr:competitor:2518': '220',  // Santos Laguna
  'sr:competitor:2519': '224',  // Toluca
  'sr:competitor:2520': '228',  // Leon
  'sr:competitor:2521': '223',  // Pachuca
};

// Team name to ESPN ID fallback mapping (for when SportsRadar ID not found)
const ESPN_TEAM_BY_NAME: Record<string, string> = {
  // Premier League
  'arsenal': '359',
  'aston villa': '333',
  'bournemouth': '337',
  'brentford': '331',
  'brighton': '348',
  'chelsea': '363',
  'crystal palace': '384',
  'everton': '368',
  'fulham': '370',
  'ipswich': '373',
  'leicester': '375',
  'liverpool': '364',
  'manchester city': '382',
  'man city': '382',
  'manchester united': '360',
  'man utd': '360',
  'newcastle': '361',
  'nottingham forest': '393',
  'southampton': '379',
  'tottenham': '367',
  'spurs': '367',
  'west ham': '383',
  'wolves': '380',
  'wolverhampton': '380',
  
  // La Liga
  'real madrid': '86',
  'barcelona': '83',
  'atletico madrid': '1068',
  'sevilla': '243',
  'real sociedad': '94',
  'valencia': '84',
  'villarreal': '102',
  'athletic bilbao': '93',
  'real betis': '95',
  'celta vigo': '87',
  'osasuna': '97',
  'getafe': '98',
  'espanyol': '88',
  'mallorca': '90',
  'rayo vallecano': '92',
  'alaves': '244',
  'las palmas': '99',
  'girona': '8315',
  'valladolid': '101',
  'leganes': '245',
  
  // Serie A
  'juventus': '111',
  'ac milan': '103',
  'milan': '103',
  'inter milan': '110',
  'inter': '110',
  'napoli': '104',
  'roma': '107',
  'lazio': '105',
  'fiorentina': '109',
  'atalanta': '106',
  'torino': '108',
  'bologna': '113',
  'udinese': '116',
  'sassuolo': '114',
  'empoli': '115',
  'genoa': '112',
  'verona': '117',
  'lecce': '3366',
  'cagliari': '119',
  'monza': '3375',
  'parma': '128',
  'como': '3162',
  
  // Bundesliga
  'bayern munich': '132',
  'bayern': '132',
  'borussia dortmund': '124',
  'dortmund': '124',
  'rb leipzig': '131',
  'leipzig': '131',
  'bayer leverkusen': '125',
  'leverkusen': '125',
  'eintracht frankfurt': '134',
  'frankfurt': '134',
  'wolfsburg': '133',
  'monchengladbach': '127',
  'borussia monchengladbach': '127',
  'union berlin': '3057',
  'freiburg': '138',
  'hoffenheim': '140',
  'mainz': '139',
  'werder bremen': '137',
  'bremen': '137',
  'augsburg': '136',
  'stuttgart': '135',
  'bochum': '143',
  'heidenheim': '3055',
  'st pauli': '141',
  'holstein kiel': '142',
  
  // Ligue 1
  'paris saint-germain': '160',
  'psg': '160',
  'monaco': '148',
  'marseille': '158',
  'lyon': '163',
  'lille': '159',
  'nice': '161',
  'rennes': '167',
  'lens': '164',
  'strasbourg': '162',
  'nantes': '165',
  'montpellier': '166',
  'toulouse': '168',
  'reims': '169',
  'brest': '3058',
  'le havre': '170',
  'angers': '3096',
  'auxerre': '171',
  'saint-etienne': '172',
  
  // Champions League notable teams
  'ajax': '86',
  'psv': '174',
  'feyenoord': '175',
  'porto': '188',
  'benfica': '187',
  'sporting': '183',
  'sporting cp': '183',
  'celtic': '209',
  'rangers': '210',
  'galatasaray': '225',
  'fenerbahce': '226',
  'besiktas': '228',
  'club brugge': '189',
  'red bull salzburg': '130',
  'salzburg': '130',
  'shakhtar donetsk': '197',
  'olympiacos': '194',
  
  // MLS
  'la galaxy': '17',
  'inter miami': '21',
  'lafc': '18',
  'atlanta united': '19',
  'seattle sounders': '6',
  'nycfc': '9',
  'new york red bulls': '10',
  'portland timbers': '5',
  'toronto fc': '7',
  'philadelphia union': '11',
  'fc cincinnati': '12',
  'columbus crew': '4',
  'austin fc': '16',
  'nashville sc': '3',
  'charlotte fc': '2',
  'sporting kc': '8',
  'real salt lake': '13',
  'minnesota united': '14',
  'houston dynamo': '15',
  'dc united': '1',
};

/**
 * Get ESPN team logo URL
 * @param teamId - SportsRadar competitor ID (e.g., 'sr:competitor:17')
 * @param teamName - Team name as fallback
 * @returns ESPN logo URL or placeholder
 */
export function getEspnTeamLogo(
  teamId?: string | null, 
  teamName?: string | null
): string {
  // Try by SportsRadar ID first
  if (teamId) {
    const espnId = ESPN_TEAM_IDS[teamId];
    if (espnId) {
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
    }
  }
  
  // Fallback to name lookup
  if (teamName) {
    const normalizedName = teamName.toLowerCase().trim();
    const espnId = ESPN_TEAM_BY_NAME[normalizedName];
    if (espnId) {
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
    }
    
    // Try partial match
    for (const [name, id] of Object.entries(ESPN_TEAM_BY_NAME)) {
      if (normalizedName.includes(name) || name.includes(normalizedName)) {
        return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
      }
    }
  }
  
  // Return generic soccer ball placeholder
  return 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png';
}

// ============================================================================
// ESPN PLAYER PHOTO SYSTEM
// ============================================================================

// Local cache for player photo URLs (prevents redundant API calls)
const playerPhotoCache = new Map<string, { url: string; timestamp: number }>();
const PHOTO_CACHE_TTL = 60 * 60 * 1000; // 1 hour local cache

/**
 * Normalize player name for cache key
 */
function normalizeNameForCache(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Get ESPN player headshot URL (synchronous - for immediate use)
 * Returns cached URL if available, otherwise placeholder
 * Call fetchPlayerPhoto() to trigger async lookup
 * 
 * @param playerName - Player's full name
 * @param playerId - Optional ESPN player ID if known
 */
export function getEspnPlayerPhoto(
  playerName?: string | null,
  playerId?: string | null
): string {
  // If we have a known ESPN player ID, construct URL directly
  if (playerId) {
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${playerId}.png&w=350&h=254`;
  }
  
  // Check local cache
  if (playerName) {
    const cacheKey = normalizeNameForCache(playerName);
    const cached = playerPhotoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PHOTO_CACHE_TTL) {
      return cached.url;
    }
  }
  
  // Return placeholder - use fetchPlayerPhoto() to trigger async lookup
  return 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254';
}

/**
 * Fetch player photo URL from backend API (async)
 * Updates local cache and returns URL
 */
export async function fetchPlayerPhoto(playerName: string): Promise<string> {
  const cacheKey = normalizeNameForCache(playerName);
  
  // Check cache first
  const cached = playerPhotoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PHOTO_CACHE_TTL) {
    return cached.url;
  }
  
  try {
    const response = await fetch(`/api/soccer/player-photo?name=${encodeURIComponent(playerName)}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json() as { photoUrl: string; found: boolean };
    const url = data.photoUrl;
    
    // Cache the result
    playerPhotoCache.set(cacheKey, { url, timestamp: Date.now() });
    
    return url;
  } catch (error) {
    console.error('Player photo fetch error:', error);
    const placeholder = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254';
    playerPhotoCache.set(cacheKey, { url: placeholder, timestamp: Date.now() });
    return placeholder;
  }
}

/**
 * Batch fetch player photos (more efficient for lists)
 * Updates local cache and returns map of name -> URL
 */
export async function fetchPlayerPhotos(playerNames: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const namesToFetch: string[] = [];
  
  // Check cache first
  for (const name of playerNames) {
    const cacheKey = normalizeNameForCache(name);
    const cached = playerPhotoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PHOTO_CACHE_TTL) {
      results.set(name, cached.url);
    } else {
      namesToFetch.push(name);
    }
  }
  
  // Fetch uncached names
  if (namesToFetch.length > 0) {
    try {
      const response = await fetch('/api/soccer/player-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: namesToFetch }),
      });
      
      if (response.ok) {
        const data = await response.json() as { 
          players: Array<{ name: string; photoUrl: string; found: boolean }> 
        };
        
        for (const player of data.players) {
          const cacheKey = normalizeNameForCache(player.name);
          playerPhotoCache.set(cacheKey, { url: player.photoUrl, timestamp: Date.now() });
          results.set(player.name, player.photoUrl);
        }
      }
    } catch (error) {
      console.error('Batch player photo fetch error:', error);
      // Set placeholders for failed fetches
      const placeholder = 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=350&h=254';
      for (const name of namesToFetch) {
        results.set(name, placeholder);
      }
    }
  }
  
  return results;
}

/**
 * React hook helper - preload photos for a list of players
 * Call this in useEffect to warm the cache
 */
export function preloadPlayerPhotos(playerNames: string[]): void {
  if (playerNames.length === 0) return;
  
  // Filter to only uncached names
  const uncached = playerNames.filter(name => {
    const cacheKey = normalizeNameForCache(name);
    const cached = playerPhotoCache.get(cacheKey);
    return !cached || Date.now() - cached.timestamp >= PHOTO_CACHE_TTL;
  });
  
  if (uncached.length > 0) {
    // Fire and forget - will update cache in background
    fetchPlayerPhotos(uncached).catch(console.error);
  }
}

/**
 * Get team abbreviation/code for display
 * @param teamName - Full team name
 * @returns 3-letter abbreviation
 */
export function getTeamAbbreviation(teamName: string): string {
  const abbreviations: Record<string, string> = {
    // Premier League
    'arsenal': 'ARS',
    'aston villa': 'AVL',
    'bournemouth': 'BOU',
    'brentford': 'BRE',
    'brighton': 'BHA',
    'chelsea': 'CHE',
    'crystal palace': 'CRY',
    'everton': 'EVE',
    'fulham': 'FUL',
    'ipswich': 'IPS',
    'leicester': 'LEI',
    'liverpool': 'LIV',
    'manchester city': 'MCI',
    'manchester united': 'MUN',
    'newcastle': 'NEW',
    'nottingham forest': 'NFO',
    'southampton': 'SOU',
    'tottenham': 'TOT',
    'west ham': 'WHU',
    'wolves': 'WOL',
    'wolverhampton': 'WOL',
    
    // La Liga
    'real madrid': 'RMA',
    'barcelona': 'BAR',
    'atletico madrid': 'ATM',
    'sevilla': 'SEV',
    'real sociedad': 'RSO',
    'valencia': 'VAL',
    'villarreal': 'VIL',
    'athletic bilbao': 'ATH',
    'real betis': 'BET',
    'celta vigo': 'CEL',
    
    // Serie A
    'juventus': 'JUV',
    'ac milan': 'MIL',
    'milan': 'MIL',
    'inter milan': 'INT',
    'inter': 'INT',
    'napoli': 'NAP',
    'roma': 'ROM',
    'lazio': 'LAZ',
    'fiorentina': 'FIO',
    'atalanta': 'ATA',
    
    // Bundesliga
    'bayern munich': 'BAY',
    'bayern': 'BAY',
    'borussia dortmund': 'BVB',
    'dortmund': 'BVB',
    'rb leipzig': 'RBL',
    'bayer leverkusen': 'B04',
    'eintracht frankfurt': 'SGE',
    
    // Ligue 1
    'paris saint-germain': 'PSG',
    'psg': 'PSG',
    'monaco': 'MON',
    'marseille': 'OM',
    'lyon': 'OL',
    'lille': 'LOS',
  };
  
  const normalized = teamName.toLowerCase().trim();
  
  // Direct match
  if (abbreviations[normalized]) {
    return abbreviations[normalized];
  }
  
  // Partial match
  for (const [name, abbr] of Object.entries(abbreviations)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return abbr;
    }
  }
  
  // Generate from first 3 letters
  return teamName.slice(0, 3).toUpperCase();
}

// ============================================================================
// STANDARDIZED SOCCER TEAM LOGO HELPER
// ============================================================================

interface SoccerTeam {
  id?: string | null;
  teamId?: string | null;
  name?: string | null;
  teamName?: string | null;
  logo?: string | null;
  teamLogo?: string | null;
}

/**
 * Get the best available soccer team logo URL
 * Checks multiple field names and falls back to ESPN lookup
 * 
 * @param team - Team object with various possible field names
 * @returns Logo URL or null if none available
 */
export function getSoccerTeamLogo(team: SoccerTeam | null | undefined): string | null {
  if (!team) return null;
  
  // Check if team already has a valid logo URL
  const existingLogo = team.logo || team.teamLogo;
  if (existingLogo && existingLogo.trim() !== '' && !existingLogo.includes('default-team-logo')) {
    return existingLogo;
  }
  
  // Resolve team ID and name from various field names
  const teamId = team.id || team.teamId || null;
  const teamName = team.name || team.teamName || null;
  
  // Use ESPN lookup
  const espnLogo = getEspnTeamLogo(teamId, teamName);
  
  // Return null if we only got the default placeholder
  if (espnLogo.includes('default-team-logo')) {
    return null;
  }
  
  return espnLogo;
}

/**
 * Get team initials for fallback display
 * "Manchester United" -> "MU", "PSG" -> "PS", "Liverpool" -> "LI"
 */
export function getSoccerTeamInitials(teamName: string | null | undefined): string {
  if (!teamName) return '??';
  const words = teamName.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  return teamName.substring(0, 2).toUpperCase();
}

// Re-export for convenience
export { ESPN_TEAM_IDS, ESPN_TEAM_BY_NAME };

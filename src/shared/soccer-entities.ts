// Soccer Entity Resolution Database
// Comprehensive aliases and metadata for teams and competitions

export interface SoccerTeam {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  country: string;
  league: string;
  leagueKey: string;
  aliases: string[];
  city?: string;
  stadium?: string;
  founded?: number;
}

export interface SoccerLeague {
  key: string;
  name: string;
  shortName: string;
  country: string;
  aliases: string[];
  tier: number;
}

// Major Soccer Leagues
export const SOCCER_LEAGUES: SoccerLeague[] = [
  // England
  { key: "soccer_epl", name: "English Premier League", shortName: "EPL", country: "England", tier: 1, aliases: ["premier league", "epl", "prem", "english premier league", "bpl", "pl"] },
  { key: "soccer_england_efl_champ", name: "EFL Championship", shortName: "Championship", country: "England", tier: 2, aliases: ["championship", "efl championship", "english championship"] },
  { key: "soccer_england_fa_cup", name: "FA Cup", shortName: "FA Cup", country: "England", tier: 1, aliases: ["fa cup", "the cup", "english cup"] },
  { key: "soccer_england_efl_cup", name: "EFL Cup", shortName: "League Cup", country: "England", tier: 2, aliases: ["league cup", "carabao cup", "efl cup", "carling cup"] },
  
  // Spain
  { key: "soccer_spain_la_liga", name: "La Liga", shortName: "La Liga", country: "Spain", tier: 1, aliases: ["la liga", "laliga", "spanish league", "primera division", "liga"] },
  { key: "soccer_spain_segunda", name: "La Liga 2", shortName: "Segunda", country: "Spain", tier: 2, aliases: ["segunda", "la liga 2", "segunda division"] },
  { key: "soccer_spain_copa_del_rey", name: "Copa del Rey", shortName: "Copa del Rey", country: "Spain", tier: 1, aliases: ["copa del rey", "spanish cup", "kings cup"] },
  
  // Germany
  { key: "soccer_germany_bundesliga", name: "Bundesliga", shortName: "Bundesliga", country: "Germany", tier: 1, aliases: ["bundesliga", "german league", "buli", "germany"] },
  { key: "soccer_germany_2_bundesliga", name: "2. Bundesliga", shortName: "2. Bundesliga", country: "Germany", tier: 2, aliases: ["2 bundesliga", "zweite bundesliga", "bundesliga 2"] },
  { key: "soccer_germany_dfb_pokal", name: "DFB-Pokal", shortName: "DFB-Pokal", country: "Germany", tier: 1, aliases: ["dfb pokal", "german cup", "dfb cup"] },
  
  // Italy
  { key: "soccer_italy_serie_a", name: "Serie A", shortName: "Serie A", country: "Italy", tier: 1, aliases: ["serie a", "italian league", "italy", "calcio", "seria a"] },
  { key: "soccer_italy_serie_b", name: "Serie B", shortName: "Serie B", country: "Italy", tier: 2, aliases: ["serie b", "italian second division"] },
  { key: "soccer_italy_coppa_italia", name: "Coppa Italia", shortName: "Coppa Italia", country: "Italy", tier: 1, aliases: ["coppa italia", "italian cup"] },
  
  // France
  { key: "soccer_france_ligue_one", name: "Ligue 1", shortName: "Ligue 1", country: "France", tier: 1, aliases: ["ligue 1", "ligue1", "french league", "france", "ligue un"] },
  { key: "soccer_france_ligue_two", name: "Ligue 2", shortName: "Ligue 2", country: "France", tier: 2, aliases: ["ligue 2", "ligue deux", "french second division"] },
  { key: "soccer_france_coupe_de_france", name: "Coupe de France", shortName: "Coupe de France", country: "France", tier: 1, aliases: ["coupe de france", "french cup"] },
  
  // UEFA
  { key: "soccer_uefa_champs_league", name: "UEFA Champions League", shortName: "UCL", country: "Europe", tier: 1, aliases: ["champions league", "ucl", "cl", "european cup", "uefa champions league"] },
  { key: "soccer_uefa_europa_league", name: "UEFA Europa League", shortName: "UEL", country: "Europe", tier: 1, aliases: ["europa league", "uel", "europa", "uefa cup"] },
  { key: "soccer_uefa_conference_league", name: "UEFA Conference League", shortName: "UECL", country: "Europe", tier: 2, aliases: ["conference league", "uecl", "europa conference"] },
  { key: "soccer_uefa_super_cup", name: "UEFA Super Cup", shortName: "Super Cup", country: "Europe", tier: 2, aliases: ["super cup", "uefa super cup"] },
  
  // Americas
  { key: "soccer_usa_mls", name: "Major League Soccer", shortName: "MLS", country: "USA", tier: 1, aliases: ["mls", "major league soccer", "american soccer"] },
  { key: "soccer_brazil_serie_a", name: "Brasileirão Série A", shortName: "Brasileirão", country: "Brazil", tier: 1, aliases: ["brasileirao", "brazilian league", "brazil serie a", "campeonato brasileiro"] },
  { key: "soccer_argentina_primera", name: "Liga Profesional Argentina", shortName: "Liga Argentina", country: "Argentina", tier: 1, aliases: ["liga argentina", "argentine league", "argentina primera"] },
  { key: "soccer_conmebol_libertadores", name: "Copa Libertadores", shortName: "Libertadores", country: "South America", tier: 1, aliases: ["libertadores", "copa libertadores"] },
  { key: "soccer_conmebol_sudamericana", name: "Copa Sudamericana", shortName: "Sudamericana", country: "South America", tier: 2, aliases: ["sudamericana", "copa sudamericana"] },
  
  // Other Europe
  { key: "soccer_netherlands_eredivisie", name: "Eredivisie", shortName: "Eredivisie", country: "Netherlands", tier: 1, aliases: ["eredivisie", "dutch league", "holland", "netherlands"] },
  { key: "soccer_portugal_primeira_liga", name: "Primeira Liga", shortName: "Liga Portugal", country: "Portugal", tier: 1, aliases: ["primeira liga", "liga portugal", "portuguese league", "portugal"] },
  { key: "soccer_belgium_first_div", name: "Belgian Pro League", shortName: "JPL", country: "Belgium", tier: 1, aliases: ["belgian league", "jupiler pro league", "belgium"] },
  { key: "soccer_scotland_premiership", name: "Scottish Premiership", shortName: "SPFL", country: "Scotland", tier: 1, aliases: ["scottish premiership", "spfl", "scotland"] },
  { key: "soccer_turkey_super_lig", name: "Süper Lig", shortName: "Süper Lig", country: "Turkey", tier: 1, aliases: ["super lig", "turkish league", "turkey"] },
  
  // International
  { key: "soccer_fifa_world_cup", name: "FIFA World Cup", shortName: "World Cup", country: "International", tier: 1, aliases: ["world cup", "fifa world cup", "wc"] },
  { key: "soccer_uefa_euro", name: "UEFA European Championship", shortName: "Euro", country: "Europe", tier: 1, aliases: ["euro", "euros", "european championship", "uefa euro"] },
  { key: "soccer_conmebol_copa_america", name: "Copa América", shortName: "Copa América", country: "South America", tier: 1, aliases: ["copa america", "copa américa"] },
  { key: "soccer_concacaf_gold_cup", name: "CONCACAF Gold Cup", shortName: "Gold Cup", country: "North America", tier: 1, aliases: ["gold cup", "concacaf gold cup"] },
  { key: "soccer_fifa_nations_league", name: "UEFA Nations League", shortName: "Nations League", country: "Europe", tier: 2, aliases: ["nations league", "uefa nations league"] },
];

// Major Soccer Teams with comprehensive aliases
export const SOCCER_TEAMS: SoccerTeam[] = [
  // ENGLAND - Premier League
  { id: "arsenal", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "Emirates Stadium", aliases: ["arsenal", "gunners", "the gunners", "ars", "afc"] },
  { id: "astonvilla", name: "Aston Villa", shortName: "Villa", abbreviation: "AVL", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Birmingham", stadium: "Villa Park", aliases: ["aston villa", "villa", "avl", "villans"] },
  { id: "bournemouth", name: "AFC Bournemouth", shortName: "Bournemouth", abbreviation: "BOU", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Bournemouth", aliases: ["bournemouth", "cherries", "afc bournemouth", "bou"] },
  { id: "brentford", name: "Brentford", shortName: "Brentford", abbreviation: "BRE", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", aliases: ["brentford", "bees", "bre"] },
  { id: "brighton", name: "Brighton & Hove Albion", shortName: "Brighton", abbreviation: "BHA", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Brighton", stadium: "Amex Stadium", aliases: ["brighton", "seagulls", "albion", "bha", "brighton and hove"] },
  { id: "chelsea", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "Stamford Bridge", aliases: ["chelsea", "blues", "che", "cfc"] },
  { id: "crystalpalace", name: "Crystal Palace", shortName: "Palace", abbreviation: "CRY", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "Selhurst Park", aliases: ["crystal palace", "palace", "eagles", "cry", "cpfc"] },
  { id: "everton", name: "Everton", shortName: "Everton", abbreviation: "EVE", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Liverpool", stadium: "Goodison Park", aliases: ["everton", "toffees", "eve", "efc"] },
  { id: "fulham", name: "Fulham", shortName: "Fulham", abbreviation: "FUL", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "Craven Cottage", aliases: ["fulham", "cottagers", "ful", "ffc"] },
  { id: "ipswich", name: "Ipswich Town", shortName: "Ipswich", abbreviation: "IPS", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Ipswich", aliases: ["ipswich", "ipswich town", "tractor boys", "ips", "itfc"] },
  { id: "leicester", name: "Leicester City", shortName: "Leicester", abbreviation: "LEI", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Leicester", stadium: "King Power Stadium", aliases: ["leicester", "leicester city", "foxes", "lei", "lcfc"] },
  { id: "liverpool", name: "Liverpool", shortName: "Liverpool", abbreviation: "LIV", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Liverpool", stadium: "Anfield", aliases: ["liverpool", "reds", "liv", "lfc", "the reds"] },
  { id: "mancity", name: "Manchester City", shortName: "Man City", abbreviation: "MCI", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Manchester", stadium: "Etihad Stadium", aliases: ["manchester city", "man city", "city", "mci", "mcfc", "cityzens"] },
  { id: "manutd", name: "Manchester United", shortName: "Man Utd", abbreviation: "MUN", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Manchester", stadium: "Old Trafford", aliases: ["manchester united", "man united", "man utd", "united", "mun", "mufc", "red devils", "man u"] },
  { id: "newcastle", name: "Newcastle United", shortName: "Newcastle", abbreviation: "NEW", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Newcastle", stadium: "St James' Park", aliases: ["newcastle", "newcastle united", "magpies", "toon", "new", "nufc"] },
  { id: "nottmforest", name: "Nottingham Forest", shortName: "Forest", abbreviation: "NFO", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Nottingham", stadium: "City Ground", aliases: ["nottingham forest", "forest", "nfo", "nffc", "nottm forest"] },
  { id: "southampton", name: "Southampton", shortName: "Southampton", abbreviation: "SOU", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Southampton", stadium: "St Mary's Stadium", aliases: ["southampton", "saints", "sou", "sfc"] },
  { id: "tottenham", name: "Tottenham Hotspur", shortName: "Spurs", abbreviation: "TOT", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "Tottenham Hotspur Stadium", aliases: ["tottenham", "spurs", "tottenham hotspur", "tot", "thfc"] },
  { id: "westham", name: "West Ham United", shortName: "West Ham", abbreviation: "WHU", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "London", stadium: "London Stadium", aliases: ["west ham", "west ham united", "hammers", "whu", "whufc", "irons"] },
  { id: "wolves", name: "Wolverhampton Wanderers", shortName: "Wolves", abbreviation: "WOL", country: "England", league: "Premier League", leagueKey: "soccer_epl", city: "Wolverhampton", stadium: "Molineux", aliases: ["wolves", "wolverhampton", "wol", "wwfc"] },
  
  // SPAIN - La Liga
  { id: "realmadrid", name: "Real Madrid", shortName: "Real Madrid", abbreviation: "RMA", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Madrid", stadium: "Santiago Bernabéu", aliases: ["real madrid", "real", "madrid", "rma", "los blancos", "merengues"] },
  { id: "barcelona", name: "FC Barcelona", shortName: "Barcelona", abbreviation: "BAR", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Barcelona", stadium: "Spotify Camp Nou", aliases: ["barcelona", "barca", "barça", "bar", "fcb", "blaugrana", "fc barcelona"] },
  { id: "atleticomadrid", name: "Atlético Madrid", shortName: "Atlético", abbreviation: "ATM", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Madrid", stadium: "Wanda Metropolitano", aliases: ["atletico madrid", "atlético madrid", "atletico", "atlético", "atm", "colchoneros", "atleti"] },
  { id: "sevilla", name: "Sevilla FC", shortName: "Sevilla", abbreviation: "SEV", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Seville", stadium: "Ramón Sánchez-Pizjuán", aliases: ["sevilla", "sev", "sfc", "sevillistas"] },
  { id: "realbetis", name: "Real Betis", shortName: "Betis", abbreviation: "BET", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Seville", aliases: ["real betis", "betis", "bet", "verdiblancos"] },
  { id: "realsociedad", name: "Real Sociedad", shortName: "La Real", abbreviation: "RSO", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "San Sebastián", aliases: ["real sociedad", "la real", "sociedad", "rso"] },
  { id: "villarreal", name: "Villarreal CF", shortName: "Villarreal", abbreviation: "VIL", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Villarreal", aliases: ["villarreal", "vil", "yellow submarine", "submarino amarillo"] },
  { id: "athleticbilbao", name: "Athletic Bilbao", shortName: "Athletic", abbreviation: "ATH", country: "Spain", league: "La Liga", leagueKey: "soccer_spain_la_liga", city: "Bilbao", stadium: "San Mamés", aliases: ["athletic bilbao", "athletic club", "bilbao", "ath", "los leones"] },
  
  // GERMANY - Bundesliga
  { id: "bayernmunich", name: "Bayern Munich", shortName: "Bayern", abbreviation: "BAY", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Munich", stadium: "Allianz Arena", aliases: ["bayern munich", "bayern", "fcb", "bay", "fc bayern", "bayern münchen", "bavarians"] },
  { id: "dortmund", name: "Borussia Dortmund", shortName: "Dortmund", abbreviation: "BVB", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Dortmund", stadium: "Signal Iduna Park", aliases: ["borussia dortmund", "dortmund", "bvb", "die schwarzgelben"] },
  { id: "leipzig", name: "RB Leipzig", shortName: "Leipzig", abbreviation: "RBL", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Leipzig", aliases: ["rb leipzig", "leipzig", "rbl", "red bull leipzig"] },
  { id: "leverkusen", name: "Bayer Leverkusen", shortName: "Leverkusen", abbreviation: "LEV", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Leverkusen", stadium: "BayArena", aliases: ["bayer leverkusen", "leverkusen", "lev", "werkself", "bayer 04"] },
  { id: "frankfurt", name: "Eintracht Frankfurt", shortName: "Frankfurt", abbreviation: "SGE", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Frankfurt", aliases: ["eintracht frankfurt", "frankfurt", "sge", "eintracht"] },
  { id: "gladbach", name: "Borussia Mönchengladbach", shortName: "Gladbach", abbreviation: "BMG", country: "Germany", league: "Bundesliga", leagueKey: "soccer_germany_bundesliga", city: "Mönchengladbach", aliases: ["borussia monchengladbach", "gladbach", "bmg", "die fohlen", "mönchengladbach"] },
  
  // ITALY - Serie A
  { id: "juventus", name: "Juventus", shortName: "Juventus", abbreviation: "JUV", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Turin", stadium: "Allianz Stadium", aliases: ["juventus", "juve", "juv", "la vecchia signora", "bianconeri"] },
  { id: "acmilan", name: "AC Milan", shortName: "Milan", abbreviation: "MIL", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Milan", stadium: "San Siro", aliases: ["ac milan", "milan", "mil", "rossoneri", "i rossoneri"] },
  { id: "inter", name: "Inter Milan", shortName: "Inter", abbreviation: "INT", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Milan", stadium: "San Siro", aliases: ["inter milan", "inter", "internazionale", "int", "nerazzurri", "i nerazzurri"] },
  { id: "napoli", name: "Napoli", shortName: "Napoli", abbreviation: "NAP", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Naples", stadium: "Diego Armando Maradona", aliases: ["napoli", "nap", "partenopei", "gli azzurri"] },
  { id: "roma", name: "AS Roma", shortName: "Roma", abbreviation: "ROM", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Rome", stadium: "Stadio Olimpico", aliases: ["roma", "as roma", "rom", "giallorossi", "i lupi"] },
  { id: "lazio", name: "Lazio", shortName: "Lazio", abbreviation: "LAZ", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Rome", stadium: "Stadio Olimpico", aliases: ["lazio", "ss lazio", "laz", "biancocelesti", "le aquile"] },
  { id: "atalanta", name: "Atalanta", shortName: "Atalanta", abbreviation: "ATA", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Bergamo", aliases: ["atalanta", "ata", "la dea", "orobici"] },
  { id: "fiorentina", name: "Fiorentina", shortName: "Fiorentina", abbreviation: "FIO", country: "Italy", league: "Serie A", leagueKey: "soccer_italy_serie_a", city: "Florence", aliases: ["fiorentina", "viola", "fio", "la viola"] },
  
  // FRANCE - Ligue 1
  { id: "psg", name: "Paris Saint-Germain", shortName: "PSG", abbreviation: "PSG", country: "France", league: "Ligue 1", leagueKey: "soccer_france_ligue_one", city: "Paris", stadium: "Parc des Princes", aliases: ["paris saint germain", "psg", "paris", "paris sg", "les parisiens"] },
  { id: "marseille", name: "Olympique de Marseille", shortName: "Marseille", abbreviation: "OM", country: "France", league: "Ligue 1", leagueKey: "soccer_france_ligue_one", city: "Marseille", stadium: "Stade Vélodrome", aliases: ["marseille", "om", "olympique marseille", "les phocéens"] },
  { id: "lyon", name: "Olympique Lyonnais", shortName: "Lyon", abbreviation: "OL", country: "France", league: "Ligue 1", leagueKey: "soccer_france_ligue_one", city: "Lyon", stadium: "Groupama Stadium", aliases: ["lyon", "ol", "olympique lyon", "olympique lyonnais", "les gones"] },
  { id: "monaco", name: "AS Monaco", shortName: "Monaco", abbreviation: "MON", country: "France", league: "Ligue 1", leagueKey: "soccer_france_ligue_one", city: "Monaco", aliases: ["monaco", "as monaco", "mon", "les rouge et blanc"] },
  { id: "lille", name: "Lille OSC", shortName: "Lille", abbreviation: "LIL", country: "France", league: "Ligue 1", leagueKey: "soccer_france_ligue_one", city: "Lille", aliases: ["lille", "losc", "lil", "les dogues"] },
  
  // NETHERLANDS - Eredivisie
  { id: "ajax", name: "Ajax Amsterdam", shortName: "Ajax", abbreviation: "AJA", country: "Netherlands", league: "Eredivisie", leagueKey: "soccer_netherlands_eredivisie", city: "Amsterdam", stadium: "Johan Cruyff Arena", aliases: ["ajax", "ajax amsterdam", "aja", "godenzonen", "afc ajax"] },
  { id: "psv", name: "PSV Eindhoven", shortName: "PSV", abbreviation: "PSV", country: "Netherlands", league: "Eredivisie", leagueKey: "soccer_netherlands_eredivisie", city: "Eindhoven", aliases: ["psv", "psv eindhoven", "boeren", "philips sport vereniging"] },
  { id: "feyenoord", name: "Feyenoord", shortName: "Feyenoord", abbreviation: "FEY", country: "Netherlands", league: "Eredivisie", leagueKey: "soccer_netherlands_eredivisie", city: "Rotterdam", stadium: "De Kuip", aliases: ["feyenoord", "fey", "de club aan de maas"] },
  
  // PORTUGAL - Primeira Liga
  { id: "benfica", name: "Benfica", shortName: "Benfica", abbreviation: "BEN", country: "Portugal", league: "Primeira Liga", leagueKey: "soccer_portugal_primeira_liga", city: "Lisbon", stadium: "Estádio da Luz", aliases: ["benfica", "sl benfica", "ben", "as águias", "encarnados"] },
  { id: "porto", name: "FC Porto", shortName: "Porto", abbreviation: "POR", country: "Portugal", league: "Primeira Liga", leagueKey: "soccer_portugal_primeira_liga", city: "Porto", stadium: "Estádio do Dragão", aliases: ["porto", "fc porto", "por", "os dragões"] },
  { id: "sporting", name: "Sporting CP", shortName: "Sporting", abbreviation: "SCP", country: "Portugal", league: "Primeira Liga", leagueKey: "soccer_portugal_primeira_liga", city: "Lisbon", stadium: "Estádio José Alvalade", aliases: ["sporting", "sporting lisbon", "sporting cp", "scp", "leões"] },
  
  // SCOTLAND
  { id: "celtic", name: "Celtic", shortName: "Celtic", abbreviation: "CEL", country: "Scotland", league: "Scottish Premiership", leagueKey: "soccer_scotland_premiership", city: "Glasgow", stadium: "Celtic Park", aliases: ["celtic", "cel", "the bhoys", "hoops"] },
  { id: "rangers", name: "Rangers", shortName: "Rangers", abbreviation: "RAN", country: "Scotland", league: "Scottish Premiership", leagueKey: "soccer_scotland_premiership", city: "Glasgow", stadium: "Ibrox", aliases: ["rangers", "ran", "gers", "the gers"] },
  
  // MLS - USA
  { id: "lafc", name: "Los Angeles FC", shortName: "LAFC", abbreviation: "LAFC", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "Los Angeles", aliases: ["lafc", "los angeles fc", "la fc"] },
  { id: "lagalaxy", name: "LA Galaxy", shortName: "Galaxy", abbreviation: "LAG", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "Los Angeles", aliases: ["la galaxy", "galaxy", "lag", "los angeles galaxy"] },
  { id: "intermiami", name: "Inter Miami CF", shortName: "Inter Miami", abbreviation: "MIA", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "Miami", aliases: ["inter miami", "miami", "mia", "inter miami cf"] },
  { id: "nycfc", name: "New York City FC", shortName: "NYCFC", abbreviation: "NYC", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "New York", aliases: ["nycfc", "nyc fc", "new york city", "nyc"] },
  { id: "redbulls", name: "New York Red Bulls", shortName: "Red Bulls", abbreviation: "RBNY", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "New York", aliases: ["new york red bulls", "red bulls", "rbny", "ny red bulls"] },
  { id: "atlanta", name: "Atlanta United", shortName: "Atlanta", abbreviation: "ATL", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "Atlanta", aliases: ["atlanta united", "atlanta", "atl", "five stripes"] },
  { id: "seattle", name: "Seattle Sounders", shortName: "Sounders", abbreviation: "SEA", country: "USA", league: "MLS", leagueKey: "soccer_usa_mls", city: "Seattle", aliases: ["seattle sounders", "sounders", "sea", "seattle"] },
];

// Find team by any alias
export function findTeam(query: string): SoccerTeam | undefined {
  const lower = query.toLowerCase().trim();
  return SOCCER_TEAMS.find(t => 
    t.id === lower ||
    t.name.toLowerCase() === lower ||
    t.shortName.toLowerCase() === lower ||
    t.abbreviation.toLowerCase() === lower ||
    t.aliases.some(a => a === lower || lower.includes(a))
  );
}

// Find all teams matching a query (fuzzy)
export function searchTeams(query: string, limit = 5): SoccerTeam[] {
  const lower = query.toLowerCase().trim();
  
  // Exact matches first
  const exactMatches = SOCCER_TEAMS.filter(t =>
    t.id === lower ||
    t.name.toLowerCase() === lower ||
    t.shortName.toLowerCase() === lower ||
    t.abbreviation.toLowerCase() === lower ||
    t.aliases.includes(lower)
  );
  
  if (exactMatches.length > 0) return exactMatches.slice(0, limit);
  
  // Partial matches
  return SOCCER_TEAMS.filter(t =>
    t.name.toLowerCase().includes(lower) ||
    t.shortName.toLowerCase().includes(lower) ||
    t.aliases.some(a => a.includes(lower) || lower.includes(a))
  ).slice(0, limit);
}

// Find league by any alias
export function findLeague(query: string): SoccerLeague | undefined {
  const lower = query.toLowerCase().trim();
  return SOCCER_LEAGUES.find(l =>
    l.key === lower ||
    l.name.toLowerCase() === lower ||
    l.shortName.toLowerCase() === lower ||
    l.aliases.some(a => a === lower || lower.includes(a))
  );
}

// Search leagues
export function searchLeagues(query: string, limit = 5): SoccerLeague[] {
  const lower = query.toLowerCase().trim();
  
  // Exact matches first
  const exactMatches = SOCCER_LEAGUES.filter(l =>
    l.key === lower ||
    l.name.toLowerCase() === lower ||
    l.shortName.toLowerCase() === lower ||
    l.aliases.includes(lower)
  );
  
  if (exactMatches.length > 0) return exactMatches.slice(0, limit);
  
  // Partial matches
  return SOCCER_LEAGUES.filter(l =>
    l.name.toLowerCase().includes(lower) ||
    l.shortName.toLowerCase().includes(lower) ||
    l.aliases.some(a => a.includes(lower) || lower.includes(a))
  ).slice(0, limit);
}

// Get teams by league
export function getTeamsByLeague(leagueKey: string): SoccerTeam[] {
  return SOCCER_TEAMS.filter(t => t.leagueKey === leagueKey);
}

// Get teams by country
export function getTeamsByCountry(country: string): SoccerTeam[] {
  const lower = country.toLowerCase();
  return SOCCER_TEAMS.filter(t => t.country.toLowerCase() === lower);
}

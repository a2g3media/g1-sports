/**
 * Soccer Competition Data
 * Maps to SportsRadar competition IDs
 */

export type CompetitionKey =
  | "premier-league"
  | "la-liga"
  | "champions-league"
  | "bundesliga"
  | "serie-a"
  | "ligue-1"
  | "mls"
  | "liga-mx"
  | "europa-league"
  | "conference-league"
  | "fa-cup"
  | "copa-del-rey"
  | "dfb-pokal"
  | "coppa-italia"
  | "eredivisie"
  | "primeira-liga"
  | "scottish-premiership"
  | "world-cup"
  | "euros"
  | "copa-america";

export interface CompetitionConfig {
  key: CompetitionKey;
  name: string;
  shortName: string;
  country: string;
  flag: string;
  type: "league" | "cup" | "international";
  color: string;
  logoUrl?: string;
}

export const SOCCER_COMPETITIONS_UI: Record<CompetitionKey, CompetitionConfig> = {
  "premier-league": {
    key: "premier-league",
    name: "Premier League",
    shortName: "PL",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    type: "league",
    color: "#3D195B",
  },
  "la-liga": {
    key: "la-liga",
    name: "La Liga",
    shortName: "LL",
    country: "Spain",
    flag: "🇪🇸",
    type: "league",
    color: "#EE8707",
  },
  "champions-league": {
    key: "champions-league",
    name: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    flag: "🇪🇺",
    type: "cup",
    color: "#1A2B5A",
  },
  "bundesliga": {
    key: "bundesliga",
    name: "Bundesliga",
    shortName: "BL",
    country: "Germany",
    flag: "🇩🇪",
    type: "league",
    color: "#D20515",
  },
  "serie-a": {
    key: "serie-a",
    name: "Serie A",
    shortName: "SA",
    country: "Italy",
    flag: "🇮🇹",
    type: "league",
    color: "#024494",
  },
  "ligue-1": {
    key: "ligue-1",
    name: "Ligue 1",
    shortName: "L1",
    country: "France",
    flag: "🇫🇷",
    type: "league",
    color: "#091C3E",
  },
  "mls": {
    key: "mls",
    name: "Major League Soccer",
    shortName: "MLS",
    country: "USA",
    flag: "🇺🇸",
    type: "league",
    color: "#C91C3E",
  },
  "liga-mx": {
    key: "liga-mx",
    name: "Liga MX",
    shortName: "LMX",
    country: "Mexico",
    flag: "🇲🇽",
    type: "league",
    color: "#009A44",
  },
  "europa-league": {
    key: "europa-league",
    name: "UEFA Europa League",
    shortName: "UEL",
    country: "Europe",
    flag: "🇪🇺",
    type: "cup",
    color: "#F68E15",
  },
  "conference-league": {
    key: "conference-league",
    name: "Conference League",
    shortName: "UECL",
    country: "Europe",
    flag: "🇪🇺",
    type: "cup",
    color: "#00FF85",
  },
  "fa-cup": {
    key: "fa-cup",
    name: "FA Cup",
    shortName: "FAC",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    type: "cup",
    color: "#FFFFFF",
  },
  "copa-del-rey": {
    key: "copa-del-rey",
    name: "Copa del Rey",
    shortName: "CDR",
    country: "Spain",
    flag: "🇪🇸",
    type: "cup",
    color: "#FFD700",
  },
  "dfb-pokal": {
    key: "dfb-pokal",
    name: "DFB-Pokal",
    shortName: "DFB",
    country: "Germany",
    flag: "🇩🇪",
    type: "cup",
    color: "#000000",
  },
  "coppa-italia": {
    key: "coppa-italia",
    name: "Coppa Italia",
    shortName: "CI",
    country: "Italy",
    flag: "🇮🇹",
    type: "cup",
    color: "#008C45",
  },
  "eredivisie": {
    key: "eredivisie",
    name: "Eredivisie",
    shortName: "ERE",
    country: "Netherlands",
    flag: "🇳🇱",
    type: "league",
    color: "#FF6319",
  },
  "primeira-liga": {
    key: "primeira-liga",
    name: "Primeira Liga",
    shortName: "PRI",
    country: "Portugal",
    flag: "🇵🇹",
    type: "league",
    color: "#006600",
  },
  "scottish-premiership": {
    key: "scottish-premiership",
    name: "Scottish Premiership",
    shortName: "SPFL",
    country: "Scotland",
    flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    type: "league",
    color: "#0066CC",
  },
  "world-cup": {
    key: "world-cup",
    name: "FIFA World Cup",
    shortName: "WC",
    country: "International",
    flag: "🌍",
    type: "international",
    color: "#5A1446",
  },
  "euros": {
    key: "euros",
    name: "UEFA Euro",
    shortName: "EURO",
    country: "Europe",
    flag: "🇪🇺",
    type: "international",
    color: "#003399",
  },
  "copa-america": {
    key: "copa-america",
    name: "Copa América",
    shortName: "CA",
    country: "South America",
    flag: "🌎",
    type: "international",
    color: "#1C5BA3",
  },
};

export const POPULAR_COMPETITIONS: CompetitionKey[] = [
  "premier-league",
  "la-liga",
  "champions-league",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "mls",
  "liga-mx",
];

/**
 * Scout Visual Intelligence Components
 * 
 * These components are designed to render structured Scout AI responses
 * as rich, data-first visual outputs with freshness indicators.
 */

// Line Movement
export { 
  LineMovementTimeline, 
  LineMovementTimelineCompact,
  type LineMovementPoint,
  type LineMovementTimelineProps 
} from "./LineMovementTimeline";

// Head-to-Head
export { 
  HeadToHeadTable, 
  HeadToHeadCompact,
  type Matchup,
  type HeadToHeadTableProps 
} from "./HeadToHeadTable";

// Form Strip
export { 
  FormStrip, 
  FormStripInline, 
  FormDots,
  type GameResult,
  type FormGame,
  type FormStripProps 
} from "./FormStrip";

// Injury Panel
export { 
  InjuryPanel, 
  InjuryBadges, 
  TeamInjurySummary,
  type InjuryStatus,
  type InjuredPlayer,
  type TeamInjuries,
  type InjuryPanelProps 
} from "./InjuryPanel";

// Weather Card
export { 
  WeatherCard, 
  WeatherBadge, 
  WeatherMini,
  type WeatherCondition,
  type WeatherData,
  type WeatherCardProps 
} from "./WeatherCard";

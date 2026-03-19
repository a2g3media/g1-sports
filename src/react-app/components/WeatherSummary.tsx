
import { 
  Cloud, CloudRain, CloudSnow, Sun, Wind, 
  Thermometer, Droplets, Eye, AlertTriangle,
  CloudLightning, CloudFog, Snowflake
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

/**
 * WeatherSummary - Weather Intelligence for Outdoor Games
 * 
 * Shows relevant weather data that could impact gameplay:
 * - Temperature and wind chill/heat index
 * - Wind speed and direction (critical for passing/kicking)
 * - Precipitation (rain/snow affects ball handling)
 * - Visibility conditions
 * 
 * Only shown for outdoor venues. Indoor games don't need weather.
 */

export interface WeatherData {
  temp: number; // Fahrenheit
  feelsLike?: number;
  condition: WeatherCondition;
  wind?: {
    speed: number; // mph
    direction?: string; // e.g., "NW", "SSE"
    gusts?: number;
  };
  precipitation?: {
    chance: number; // 0-100
    type?: "rain" | "snow" | "sleet" | "mixed";
    accumulation?: string; // e.g., "1-2 inches"
  };
  humidity?: number;
  visibility?: number; // miles
}

export type WeatherCondition = 
  | "clear" 
  | "partly_cloudy" 
  | "cloudy" 
  | "rain" 
  | "heavy_rain"
  | "snow" 
  | "heavy_snow"
  | "thunderstorm"
  | "fog"
  | "windy"
  | "cold"
  | "hot";

// Weather impact analysis
interface WeatherImpact {
  level: "none" | "low" | "medium" | "high";
  factors: string[];
  summary: string;
}

function analyzeWeatherImpact(weather: WeatherData): WeatherImpact {
  const factors: string[] = [];
  let level: WeatherImpact["level"] = "none";
  
  // Temperature impacts
  if (weather.temp < 32) {
    factors.push("Cold temps affect ball grip and player mobility");
    level = "medium";
  } else if (weather.temp < 20) {
    factors.push("Extreme cold significantly impacts passing game");
    level = "high";
  } else if (weather.temp > 90) {
    factors.push("Heat may cause fatigue, especially late in game");
    level = "medium";
  }
  
  // Wind impacts
  if (weather.wind) {
    if (weather.wind.speed >= 20) {
      factors.push("Strong winds heavily affect passing and kicking");
      level = "high";
    } else if (weather.wind.speed >= 15) {
      factors.push("Wind may impact deep balls and field goals");
      level = level === "high" ? "high" : "medium";
    } else if (weather.wind.speed >= 10) {
      factors.push("Light wind could affect long kicks");
      level = level !== "none" ? level : "low";
    }
    
    if (weather.wind.gusts && weather.wind.gusts >= 30) {
      factors.push("Gusty conditions create unpredictable ball flight");
      level = "high";
    }
  }
  
  // Precipitation impacts
  if (weather.precipitation && weather.precipitation.chance > 50) {
    if (weather.precipitation.type === "snow" || weather.precipitation.type === "sleet") {
      factors.push("Snow affects visibility and footing");
      level = "high";
    } else if (weather.precipitation.type === "rain") {
      factors.push("Rain increases fumble risk and affects passing");
      level = level === "high" ? "high" : "medium";
    }
  }
  
  // Visibility impacts
  if (weather.visibility && weather.visibility < 1) {
    factors.push("Poor visibility impacts downfield passing");
    level = "high";
  }
  
  // Generate summary
  let summary = "No significant weather impact expected";
  if (level === "low") {
    summary = "Minor weather factors to consider";
  } else if (level === "medium") {
    summary = "Weather may affect game strategy";
  } else if (level === "high") {
    summary = "Significant weather impact expected";
  }
  
  return { level, factors, summary };
}

// Weather condition config
const WEATHER_CONFIG: Record<WeatherCondition, {
  icon: typeof Sun;
  label: string;
  color: string;
  bgColor: string;
}> = {
  clear: {
    icon: Sun,
    label: "Clear",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10"
  },
  partly_cloudy: {
    icon: Cloud,
    label: "Partly Cloudy",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-500/10"
  },
  cloudy: {
    icon: Cloud,
    label: "Cloudy",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-500/10"
  },
  rain: {
    icon: CloudRain,
    label: "Rain",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10"
  },
  heavy_rain: {
    icon: CloudRain,
    label: "Heavy Rain",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-600/15"
  },
  snow: {
    icon: CloudSnow,
    label: "Snow",
    color: "text-sky-600 dark:text-sky-400",
    bgColor: "bg-sky-500/10"
  },
  heavy_snow: {
    icon: Snowflake,
    label: "Heavy Snow",
    color: "text-sky-700 dark:text-sky-300",
    bgColor: "bg-sky-600/15"
  },
  thunderstorm: {
    icon: CloudLightning,
    label: "Thunderstorm",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/10"
  },
  fog: {
    icon: CloudFog,
    label: "Fog",
    color: "text-slate-500 dark:text-slate-400",
    bgColor: "bg-slate-400/10"
  },
  windy: {
    icon: Wind,
    label: "Windy",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-500/10"
  },
  cold: {
    icon: Thermometer,
    label: "Cold",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10"
  },
  hot: {
    icon: Thermometer,
    label: "Hot",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10"
  }
};

// Impact level colors
const IMPACT_COLORS = {
  none: "text-muted-foreground",
  low: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400"
};

const IMPACT_BG = {
  none: "bg-muted/50",
  low: "bg-green-500/10",
  medium: "bg-amber-500/10",
  high: "bg-red-500/10"
};

interface WeatherBadgeProps {
  weather: WeatherData;
  showTooltip?: boolean;
}

/**
 * Compact weather badge for game cards
 */
export function WeatherBadge({ weather, showTooltip = true }: WeatherBadgeProps) {
  const config = WEATHER_CONFIG[weather.condition];
  const impact = analyzeWeatherImpact(weather);
  const Icon = config.icon;
  
  const badge = (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
      impact.level === "high" ? IMPACT_BG.high : config.bgColor,
      impact.level === "high" ? IMPACT_COLORS.high : config.color
    )}>
      <Icon className="w-3.5 h-3.5" />
      <span>{weather.temp}°F</span>
      {weather.wind && weather.wind.speed >= 10 && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <Wind className="w-3 h-3" />
          <span>{weather.wind.speed}mph</span>
        </>
      )}
    </div>
  );
  
  if (!showTooltip) return badge;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-0">
          <WeatherTooltipContent weather={weather} impact={impact} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function WeatherTooltipContent({ weather, impact }: { weather: WeatherData; impact: WeatherImpact }) {
  const config = WEATHER_CONFIG[weather.condition];
  const Icon = config.icon;
  
  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded-lg", config.bgColor)}>
          <Icon className={cn("w-4 h-4", config.color)} />
        </div>
        <div>
          <span className="font-medium">{config.label}</span>
          <span className="text-muted-foreground ml-2">{weather.temp}°F</span>
          {weather.feelsLike && weather.feelsLike !== weather.temp && (
            <span className="text-xs text-muted-foreground ml-1">
              (feels {weather.feelsLike}°)
            </span>
          )}
        </div>
      </div>
      
      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {weather.wind && (
          <div className="flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              {weather.wind.speed} mph {weather.wind.direction || ""}
              {weather.wind.gusts && ` (gusts ${weather.wind.gusts})`}
            </span>
          </div>
        )}
        {weather.precipitation && weather.precipitation.chance > 0 && (
          <div className="flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{weather.precipitation.chance}% precip</span>
          </div>
        )}
        {weather.humidity && (
          <div className="flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{weather.humidity}% humidity</span>
          </div>
        )}
        {weather.visibility && weather.visibility < 10 && (
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{weather.visibility} mi visibility</span>
          </div>
        )}
      </div>
      
      {/* Impact Assessment */}
      {impact.level !== "none" && (
        <div className={cn(
          "rounded-lg px-2.5 py-2 border",
          IMPACT_BG[impact.level],
          impact.level === "high" ? "border-red-500/20" : "border-transparent"
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            {impact.level === "high" && <AlertTriangle className="w-3.5 h-3.5" />}
            <span className={cn("text-xs font-medium", IMPACT_COLORS[impact.level])}>
              {impact.summary}
            </span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {impact.factors.slice(0, 3).map((factor, i) => (
              <li key={i}>• {factor}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface WeatherSummaryProps {
  weather: WeatherData;
  venue?: string;
  className?: string;
}

/**
 * Expanded weather summary for game detail views
 */
export function WeatherSummary({ weather, venue, className }: WeatherSummaryProps) {
  const config = WEATHER_CONFIG[weather.condition];
  const impact = analyzeWeatherImpact(weather);
  const Icon = config.icon;
  
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", config.bgColor)}>
            <Icon className={cn("w-6 h-6", config.color)} />
          </div>
          <div>
            <h4 className="font-semibold">{config.label}</h4>
            {venue && (
              <p className="text-sm text-muted-foreground">{venue}</p>
            )}
          </div>
        </div>
        
        {/* Temperature */}
        <div className="text-right">
          <span className="text-2xl font-bold tabular-nums">{weather.temp}°</span>
          {weather.feelsLike && weather.feelsLike !== weather.temp && (
            <p className="text-xs text-muted-foreground">
              Feels like {weather.feelsLike}°
            </p>
          )}
        </div>
      </div>
      
      {/* Weather Details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {weather.wind && (
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {weather.wind.speed} mph {weather.wind.direction || ""}
              </p>
              {weather.wind.gusts && (
                <p className="text-xs text-muted-foreground">
                  Gusts to {weather.wind.gusts} mph
                </p>
              )}
            </div>
          </div>
        )}
        
        {weather.precipitation && weather.precipitation.chance > 0 && (
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{weather.precipitation.chance}%</p>
              <p className="text-xs text-muted-foreground">
                {weather.precipitation.type || "Precipitation"}
              </p>
            </div>
          </div>
        )}
        
        {weather.humidity && (
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{weather.humidity}%</p>
              <p className="text-xs text-muted-foreground">Humidity</p>
            </div>
          </div>
        )}
        
        {weather.visibility && (
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{weather.visibility} mi</p>
              <p className="text-xs text-muted-foreground">Visibility</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Impact Assessment */}
      {impact.level !== "none" && (
        <div className={cn(
          "rounded-lg px-3 py-2.5",
          IMPACT_BG[impact.level]
        )}>
          <div className="flex items-center gap-2 mb-1.5">
            {impact.level === "high" && (
              <AlertTriangle className={cn("w-4 h-4", IMPACT_COLORS[impact.level])} />
            )}
            <span className={cn("text-sm font-medium", IMPACT_COLORS[impact.level])}>
              {impact.summary}
            </span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1">
            {impact.factors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground/50">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Convert simple weather object to full WeatherData
 */
export function parseSimpleWeather(simple: { temp: number; condition: string; wind?: string }): WeatherData {
  // Parse condition
  const conditionLower = simple.condition.toLowerCase();
  let condition: WeatherCondition = "clear";
  
  if (conditionLower.includes("snow")) {
    condition = conditionLower.includes("heavy") ? "heavy_snow" : "snow";
  } else if (conditionLower.includes("rain")) {
    condition = conditionLower.includes("heavy") ? "heavy_rain" : "rain";
  } else if (conditionLower.includes("thunder") || conditionLower.includes("storm")) {
    condition = "thunderstorm";
  } else if (conditionLower.includes("fog") || conditionLower.includes("mist")) {
    condition = "fog";
  } else if (conditionLower.includes("cloud")) {
    condition = conditionLower.includes("partly") ? "partly_cloudy" : "cloudy";
  } else if (conditionLower.includes("clear") || conditionLower.includes("sunny")) {
    condition = "clear";
  }
  
  // Parse wind
  let wind: WeatherData["wind"] | undefined;
  if (simple.wind) {
    const windMatch = simple.wind.match(/(\d+)\s*mph\s*([NSEW]+)?/i);
    if (windMatch) {
      wind = {
        speed: parseInt(windMatch[1]),
        direction: windMatch[2]?.toUpperCase()
      };
    }
  }
  
  // Calculate feels like for extreme temps
  let feelsLike: number | undefined;
  if (simple.temp < 40 && wind && wind.speed > 5) {
    // Simple wind chill approximation
    feelsLike = Math.round(simple.temp - (wind.speed * 0.7));
  } else if (simple.temp > 85) {
    // Simple heat index (humidity assumed 50%)
    feelsLike = Math.round(simple.temp + 5);
  }
  
  return {
    temp: simple.temp,
    feelsLike,
    condition,
    wind,
    precipitation: condition.includes("rain") || condition.includes("snow") 
      ? { chance: 70, type: condition.includes("snow") ? "snow" : "rain" }
      : undefined
  };
}

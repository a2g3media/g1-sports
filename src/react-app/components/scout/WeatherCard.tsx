/**
 * WeatherCard - Display weather conditions for outdoor games
 * Part of Scout Visual Intelligence system
 */

import { cn } from "@/react-app/lib/utils";
import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudSnow,
  CloudLightning,
  Wind,
  Droplets,
  Eye,
  Gauge,
  AlertTriangle,
  CloudFog
} from "lucide-react";
import { FreshnessBadge, FreshnessLevel } from "@/react-app/components/ui/freshness-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/react-app/components/ui/tooltip";

export type WeatherCondition = 
  | "clear" 
  | "partly-cloudy" 
  | "cloudy" 
  | "rain" 
  | "heavy-rain" 
  | "snow" 
  | "thunderstorm" 
  | "fog"
  | "windy";

export interface WeatherData {
  condition: WeatherCondition;
  temperature: number;
  feelsLike?: number;
  windSpeed: number;
  windDirection?: string;
  windGusts?: number;
  precipitation?: number;
  precipChance?: number;
  humidity?: number;
  visibility?: number;
  pressure?: number;
  gameTimeTemp?: number;
}

export interface WeatherCardProps {
  venue: string;
  weather: WeatherData;
  gameTime?: string;
  isIndoor?: boolean;
  freshness?: FreshnessLevel;
  lastUpdated?: string;
  showImpact?: boolean;
  className?: string;
}

const conditionConfig: Record<WeatherCondition, {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
}> = {
  clear: {
    icon: Sun,
    label: "Clear",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
  "partly-cloudy": {
    icon: Cloud,
    label: "Partly Cloudy",
    color: "text-slate-400",
    bg: "bg-slate-500/15",
  },
  cloudy: {
    icon: Cloud,
    label: "Cloudy",
    color: "text-slate-500",
    bg: "bg-slate-500/20",
  },
  rain: {
    icon: CloudRain,
    label: "Rain",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
  },
  "heavy-rain": {
    icon: CloudRain,
    label: "Heavy Rain",
    color: "text-blue-500",
    bg: "bg-blue-500/20",
  },
  snow: {
    icon: CloudSnow,
    label: "Snow",
    color: "text-cyan-300",
    bg: "bg-cyan-500/15",
  },
  thunderstorm: {
    icon: CloudLightning,
    label: "Thunderstorm",
    color: "text-purple-400",
    bg: "bg-purple-500/15",
  },
  fog: {
    icon: CloudFog,
    label: "Fog",
    color: "text-slate-400",
    bg: "bg-slate-500/15",
  },
  windy: {
    icon: Wind,
    label: "Windy",
    color: "text-teal-400",
    bg: "bg-teal-500/15",
  },
};

function getGameImpact(weather: WeatherData): {
  level: "none" | "minor" | "moderate" | "significant";
  factors: string[];
} {
  const factors: string[] = [];
  let impactScore = 0;

  // Wind impact
  if (weather.windSpeed >= 20) {
    impactScore += 3;
    factors.push(`High winds (${weather.windSpeed} mph)`);
  } else if (weather.windSpeed >= 15) {
    impactScore += 2;
    factors.push(`Moderate winds (${weather.windSpeed} mph)`);
  } else if (weather.windSpeed >= 10) {
    impactScore += 1;
  }

  // Temperature extremes
  if (weather.temperature <= 32 || weather.temperature >= 95) {
    impactScore += 2;
    factors.push(weather.temperature <= 32 ? "Freezing temps" : "Extreme heat");
  } else if (weather.temperature <= 40 || weather.temperature >= 85) {
    impactScore += 1;
  }

  // Precipitation
  if (weather.precipitation && weather.precipitation > 0.5) {
    impactScore += 3;
    factors.push("Active precipitation");
  } else if (weather.precipChance && weather.precipChance >= 70) {
    impactScore += 2;
    factors.push(`${weather.precipChance}% rain chance`);
  } else if (weather.precipChance && weather.precipChance >= 40) {
    impactScore += 1;
  }

  // Severe conditions
  if (weather.condition === "thunderstorm" || weather.condition === "heavy-rain") {
    impactScore += 2;
    if (!factors.includes("Active precipitation")) {
      factors.push("Severe weather");
    }
  }

  const level = impactScore >= 5 ? "significant" 
    : impactScore >= 3 ? "moderate" 
    : impactScore >= 1 ? "minor" 
    : "none";

  return { level, factors };
}

export function WeatherCard({
  venue,
  weather,
  gameTime,
  isIndoor = false,
  freshness = "fresh",
  lastUpdated,
  showImpact = true,
  className,
}: WeatherCardProps) {
  const config = conditionConfig[weather.condition];
  const Icon = config.icon;
  const impact = getGameImpact(weather);

  if (isIndoor) {
    return (
      <div className={cn(
        "rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4",
        className
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Sun className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{venue}</h4>
              <p className="text-xs text-emerald-400">Indoor • Climate controlled</p>
            </div>
          </div>
          <span className="text-lg font-bold">72°F</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden",
      className
    )}>
      {/* Header with main condition */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              config.bg
            )}>
              <Icon className={cn("w-6 h-6", config.color)} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{venue}</h4>
              <p className={cn("text-xs", config.color)}>{config.label}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{weather.temperature}°F</p>
            {weather.feelsLike && weather.feelsLike !== weather.temperature && (
              <p className="text-xs text-muted-foreground">
                Feels like {weather.feelsLike}°
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {gameTime && `Game time: ${gameTime}`}
            {weather.gameTimeTemp && ` (${weather.gameTimeTemp}°F)`}
          </span>
          <FreshnessBadge level={freshness} timestamp={lastUpdated} compact />
        </div>
      </div>

      {/* Weather details grid */}
      <div className="grid grid-cols-4 gap-px bg-border/30">
        <WeatherStat 
          icon={Wind} 
          label="Wind" 
          value={`${weather.windSpeed}`}
          unit="mph"
          subValue={weather.windDirection}
          highlight={weather.windSpeed >= 15}
        />
        <WeatherStat 
          icon={Droplets} 
          label="Precip" 
          value={weather.precipChance !== undefined ? `${weather.precipChance}` : "-"}
          unit="%"
          highlight={weather.precipChance !== undefined && weather.precipChance >= 50}
        />
        <WeatherStat 
          icon={Eye} 
          label="Humidity" 
          value={weather.humidity !== undefined ? `${weather.humidity}` : "-"}
          unit="%"
        />
        <WeatherStat 
          icon={Gauge} 
          label="Gusts" 
          value={weather.windGusts !== undefined ? `${weather.windGusts}` : "-"}
          unit="mph"
          highlight={weather.windGusts !== undefined && weather.windGusts >= 25}
        />
      </div>

      {/* Game impact assessment */}
      {showImpact && impact.level !== "none" && (
        <div className={cn(
          "px-4 py-2.5 border-t border-border/50",
          impact.level === "significant" && "bg-red-500/5",
          impact.level === "moderate" && "bg-amber-500/5",
          impact.level === "minor" && "bg-blue-500/5"
        )}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={cn(
              "w-4 h-4 flex-shrink-0 mt-0.5",
              impact.level === "significant" && "text-red-400",
              impact.level === "moderate" && "text-amber-400",
              impact.level === "minor" && "text-blue-400"
            )} />
            <div>
              <p className={cn(
                "text-xs font-medium",
                impact.level === "significant" && "text-red-400",
                impact.level === "moderate" && "text-amber-400",
                impact.level === "minor" && "text-blue-400"
              )}>
                {impact.level === "significant" ? "Significant" : 
                 impact.level === "moderate" ? "Moderate" : "Minor"} Game Impact
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {impact.factors.join(" • ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual stat component
function WeatherStat({
  icon: Icon,
  label,
  value,
  unit,
  subValue,
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "px-3 py-2.5 bg-card text-center",
      highlight && "bg-amber-500/5"
    )}>
      <Icon className={cn(
        "w-4 h-4 mx-auto mb-1",
        highlight ? "text-amber-400" : "text-muted-foreground"
      )} />
      <p className={cn(
        "text-sm font-bold",
        highlight && "text-amber-400"
      )}>
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {subValue || label}
      </p>
    </div>
  );
}

// Compact inline version
export function WeatherBadge({
  weather,
  className,
}: {
  weather: WeatherData;
  className?: string;
}) {
  const config = conditionConfig[weather.condition];
  const Icon = config.icon;
  const impact = getGameImpact(weather);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg",
            config.bg,
            className
          )}>
            <Icon className={cn("w-3.5 h-3.5", config.color)} />
            <span className="text-xs font-medium">{weather.temperature}°F</span>
            {weather.windSpeed >= 10 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Wind className="w-2.5 h-2.5" />
                {weather.windSpeed}
              </span>
            )}
            {impact.level !== "none" && (
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                impact.level === "significant" && "bg-red-500",
                impact.level === "moderate" && "bg-amber-500",
                impact.level === "minor" && "bg-blue-500"
              )} />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="text-xs font-medium">{config.label} • {weather.temperature}°F</p>
            <p className="text-xs text-muted-foreground">
              Wind: {weather.windSpeed} mph
              {weather.precipChance !== undefined && ` • ${weather.precipChance}% precip`}
            </p>
            {impact.factors.length > 0 && (
              <p className="text-xs text-amber-400">{impact.factors.join(", ")}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Mini version for table cells
export function WeatherMini({
  weather,
  className,
}: {
  weather: WeatherData;
  className?: string;
}) {
  const config = conditionConfig[weather.condition];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Icon className={cn("w-3 h-3", config.color)} />
      <span className="text-xs">{weather.temperature}°</span>
    </div>
  );
}

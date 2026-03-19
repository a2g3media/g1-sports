import { useState } from "react";
import { Link } from "react-router-dom";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { CoachGExternalLinkIcon } from "@/react-app/components/CoachGExternalLinkIcon";

type CoachGVariant = "hub" | "league" | "team" | "match" | "player";

interface CoachGDeskProps {
  variant: CoachGVariant;
  leagueId?: string;
  teamId?: string;
  matchId?: string;
  playerId?: string;
  isLive?: boolean;
}

interface HeadlineItem {
  category: string;
  text: string;
}

export default function CoachGDesk({
  variant,
  leagueId,
  teamId,
  playerId,
  isLive = false,
}: CoachGDeskProps) {
  // Default collapsed state based on variant
  const defaultExpanded = variant !== "player";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Generate title based on variant
  const getTitle = () => {
    switch (variant) {
      case "hub":
        return "Coach G Live Desk";
      case "league":
        return "Coach G — League Brief";
      case "team":
        return "Coach G — Team Report";
      case "match":
        return "Coach G — Match Brief";
      case "player":
        return "Coach G — Player Read";
      default:
        return "Coach G";
    }
  };

  // Generate CTA link and text based on variant
  const getCTA = () => {
    let href = "/sports/soccer/news";
    let text = "All Soccer Headlines";

    if (leagueId) {
      href += `?leagueId=${leagueId}`;
      text = "View League Headlines";
    } else if (teamId) {
      href += `?teamId=${teamId}`;
      text = "More Team Intel";
    } else if (playerId) {
      href += `?playerId=${playerId}`;
      text = "Player Headlines";
    }

    return { href, text };
  };

  // Generate placeholder content based on variant
  const getContent = (): { insights: string[]; headlines: HeadlineItem[] } => {
    switch (variant) {
      case "hub":
        return {
          insights: ["Arsenal vs Liverpool — Elite midfield battle expected at Anfield"],
          headlines: [
            { category: "TRANSFER", text: "Manchester United monitoring €80M midfielder ahead of summer window" },
            { category: "INJURY", text: "Haaland returns to training, expected available for Champions League tie" },
            { category: "TACTICAL", text: "Guardiola adjusting defensive structure after recent set-piece vulnerability" },
            { category: "MARKET", text: "Sharp money on Under 2.5 in Atletico fixture despite offensive form" },
          ],
        };
      case "league":
        return {
          insights: [
            "Title race tightening with Arsenal closing gap to 4 points after recent form",
            "Bottom three separation widening — survival battle intensifying",
          ],
          headlines: [
            { category: "FORM", text: "Liverpool unbeaten in last 8, defensive solidity key to recent run" },
            { category: "INJURY", text: "Chelsea dealing with defensive depth issues ahead of congested schedule" },
            { category: "TACTICAL", text: "Brighton's pressing numbers highest in league over last 5 matches" },
          ],
        };
      case "team":
        return {
          insights: [
            "High possession identity with progressive passing through central channels",
            "Current form trending positive — 3 wins in last 5 matches",
            "Key player: Central midfielder averaging 90+ touches, dictating tempo",
          ],
          headlines: [
            { category: "FORM", text: "Defensive improvements evident with 3 clean sheets in last 4 home matches" },
            { category: "TACTICAL", text: "Adjusted pressing triggers showing results in opponent third" },
            { category: "SQUAD", text: "Youth academy talent impressing in recent cup appearances" },
          ],
        };
      case "match":
        return {
          insights: isLive
            ? [
                "Tactical adjustment after 30' — home side shifting to deeper defensive block",
                "Watch for counterattacking patterns through right channel next 15 minutes",
                "Momentum shifting toward away side after sustained pressure spell",
              ]
            : [
                "Expect tactical chess match with both sides favoring controlled build-up",
                "Set pieces likely decisive — both defenses vulnerable on deliveries",
                "Watch midfield battle — winner controls tempo and territory",
              ],
          headlines: [],
        };
      case "player":
        return {
          insights: [
            "Primary role: Advanced playmaker with freedom to drift between lines",
            "Form trending upward — key stats improving over last 5 appearances",
          ],
          headlines: [
            { category: "FORM", text: "Contributing to goal involvement every 78 minutes over last month" },
            { category: "TACTICAL", text: "Manager increasing creative burden in attacking third transitions" },
          ],
        };
      default:
        return { insights: [], headlines: [] };
    }
  };

  const title = getTitle();
  const cta = getCTA();
  const { insights, headlines } = getContent();
  const minutesAgo = Math.floor(Math.random() * 8) + 2; // Placeholder: 2-10 minutes

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-black/40 backdrop-blur-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-cyan-400" />
          <div className="flex flex-col items-start">
            <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>
            {isLive && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs text-red-400 font-medium">LIVE</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40 hidden sm:block">Updated {minutesAgo} min ago</span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-white/40" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/40" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-4 space-y-4">
          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-2">
              {insights.map((insight, index) => (
                <div key={index} className="text-sm text-white/70 leading-relaxed">
                  {insight}
                </div>
              ))}
            </div>
          )}

          {/* Headlines */}
          {headlines.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/5">
              {headlines.map((headline, index) => (
                <div key={index} className="group">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-cyan-400 mt-0.5 tracking-wider">
                      {headline.category}
                    </span>
                    <p className="text-sm text-white/60 group-hover:text-white/80 transition-colors flex-1">
                      {headline.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA Link */}
          {variant !== "match" && (
            <Link
              to={cta.href}
              className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors pt-2"
            >
              <span>{cta.text}</span>
              <CoachGExternalLinkIcon />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

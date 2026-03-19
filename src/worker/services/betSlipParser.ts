/**
 * Universal Bet Slip Parser
 * 
 * Multi-pass AI-powered parser that can read bet tickets from ANY sportsbook.
 * Uses semantic understanding rather than sportsbook-specific rules.
 */

// Types for parsed data with confidence scores
export interface ParsedLeg {
  team_or_player: string;
  opponent_or_context: string | null;
  market_type: 'Spread' | 'Moneyline' | 'Total' | 'Player Prop' | 'Team Total' | 'Other';
  side: 'home' | 'away' | 'over' | 'under' | null;
  user_line_value: number | null;
  user_odds: number | null;
  sport: string | null;
  league: string | null;
  game_date: string | null;
  raw_text: string;
  confidence: LegConfidence;
}

export interface LegConfidence {
  overall: number; // 0-100
  team_or_player: number;
  market_type: number;
  line_value: number;
  odds: number;
  sport: number;
}

export interface ParsedTicket {
  sportsbook: string | null;
  sportsbook_confidence: number;
  ticket_type: 'single' | 'parlay' | 'teaser' | 'round_robin' | 'same_game_parlay';
  stake_amount: number | null;
  to_win_amount: number | null;
  potential_payout: number | null;
  total_odds: number | null;
  legs: ParsedLeg[];
  parsing_notes: string[];
  overall_confidence: number;
  needs_review: boolean;
  review_reasons: string[];
}

// Known sportsbook signatures for identification
const SPORTSBOOK_SIGNATURES = [
  { name: 'DraftKings', patterns: ['draftkings', 'dk', 'dksb'] },
  { name: 'FanDuel', patterns: ['fanduel', 'fd'] },
  { name: 'BetMGM', patterns: ['betmgm', 'mgm', 'roar'] },
  { name: 'Caesars', patterns: ['caesars', 'william hill'] },
  { name: 'PointsBet', patterns: ['pointsbet'] },
  { name: 'ESPN BET', patterns: ['espn bet', 'espnbet'] },
  { name: 'bet365', patterns: ['bet365', 'b365'] },
  { name: 'BetRivers', patterns: ['betrivers', 'rivers'] },
  { name: 'Fanatics', patterns: ['fanatics'] },
  { name: 'Hard Rock Bet', patterns: ['hard rock', 'hardrock'] },
  { name: 'Betway', patterns: ['betway'] },
  { name: 'Unibet', patterns: ['unibet'] },
  { name: 'WynnBET', patterns: ['wynnbet', 'wynn'] },
  { name: 'Barstool', patterns: ['barstool'] },
  { name: 'FOX Bet', patterns: ['fox bet', 'foxbet'] },
  { name: 'Tipico', patterns: ['tipico'] },
  { name: 'Superbook', patterns: ['superbook'] },
  { name: 'BetUS', patterns: ['betus'] },
  { name: 'Bovada', patterns: ['bovada'] },
  { name: 'MyBookie', patterns: ['mybookie'] },
  { name: 'BetOnline', patterns: ['betonline'] },
];

// Sport identification helpers
const SPORT_PATTERNS = {
  'NBA': ['nba', 'basketball', 'lakers', 'celtics', 'warriors', 'nets', 'knicks', 'heat', 'bucks', 'suns', 'nuggets', 'clippers', '76ers', 'sixers', 'hawks', 'bulls', 'cavs', 'cavaliers', 'mavericks', 'mavs', 'rockets', 'grizzlies', 'timberwolves', 'wolves', 'pelicans', 'thunder', 'magic', 'pacers', 'blazers', 'trail blazers', 'kings', 'spurs', 'raptors', 'jazz', 'wizards', 'pistons', 'hornets'],
  'NFL': ['nfl', 'football', 'chiefs', 'eagles', 'bills', 'cowboys', 'niners', '49ers', 'dolphins', 'lions', 'ravens', 'jaguars', 'jags', 'chargers', 'seahawks', 'bengals', 'packers', 'jets', 'broncos', 'raiders', 'vikings', 'steelers', 'browns', 'texans', 'colts', 'titans', 'falcons', 'panthers', 'buccaneers', 'bucs', 'saints', 'cardinals', 'rams', 'commanders', 'giants', 'bears'],
  'MLB': ['mlb', 'baseball', 'yankees', 'dodgers', 'braves', 'astros', 'phillies', 'padres', 'mets', 'mariners', 'guardians', 'orioles', 'twins', 'rangers', 'blue jays', 'rays', 'brewers', 'cubs', 'red sox', 'white sox', 'reds', 'giants', 'cardinals', 'diamondbacks', 'dbacks', 'rockies', 'royals', 'pirates', 'tigers', 'angels', 'nationals', 'marlins', 'athletics'],
  'NHL': ['nhl', 'hockey', 'bruins', 'avalanche', 'oilers', 'golden knights', 'knights', 'panthers', 'hurricanes', 'rangers', 'devils', 'maple leafs', 'leafs', 'jets', 'lightning', 'stars', 'kings', 'wild', 'flames', 'canucks', 'senators', 'blues', 'islanders', 'capitals', 'caps', 'penguins', 'pens', 'kraken', 'predators', 'preds', 'blackhawks', 'ducks', 'sharks', 'blue jackets', 'red wings', 'sabres', 'canadiens', 'habs', 'coyotes', 'flyers'],
  'NCAAB': ['ncaab', 'ncaa basketball', 'college basketball', 'march madness', 'duke', 'unc', 'tar heels', 'kentucky', 'kansas', 'jayhawks', 'gonzaga', 'villanova', 'purdue', 'uconn', 'huskies', 'alabama', 'tennessee', 'houston', 'baylor', 'arizona', 'wildcats', 'auburn', 'creighton'],
  'NCAAF': ['ncaaf', 'ncaa football', 'college football', 'cfb', 'georgia', 'bulldogs', 'michigan', 'wolverines', 'ohio state', 'buckeyes', 'alabama', 'crimson tide', 'clemson', 'tigers', 'texas', 'longhorns', 'oklahoma', 'sooners', 'lsu', 'usc', 'trojans', 'oregon', 'ducks', 'penn state', 'florida', 'gators', 'notre dame', 'fighting irish'],
  'Soccer': ['soccer', 'football', 'premier league', 'epl', 'la liga', 'serie a', 'bundesliga', 'mls', 'champions league', 'ucl', 'europa', 'manchester', 'man utd', 'man city', 'liverpool', 'chelsea', 'arsenal', 'tottenham', 'spurs', 'real madrid', 'barcelona', 'barca', 'bayern', 'psg', 'juventus', 'milan', 'inter', 'atletico', 'dortmund'],
  'UFC': ['ufc', 'mma', 'fight', 'ko', 'submission', 'decision'],
  'Tennis': ['tennis', 'atp', 'wta', 'grand slam', 'wimbledon', 'us open', 'french open', 'australian open'],
  'Golf': ['golf', 'pga', 'masters', 'us open golf', 'british open', 'ryder cup'],
};



/**
 * Build the system prompt for universal bet slip parsing
 */
function buildUniversalParsePrompt(): string {
  return `You are an expert bet slip parser that can accurately read bet tickets from ANY sportsbook worldwide.

## YOUR TASK
Analyze the bet slip image and extract ALL betting information with maximum precision. This data is critical for bet tracking.

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{
  "sportsbook": "sportsbook name or null if unknown",
  "sportsbook_confidence": 0-100,
  "ticket_type": "single" | "parlay" | "teaser" | "round_robin" | "same_game_parlay",
  "stake_amount": number or null,
  "to_win_amount": number or null,
  "potential_payout": number or null (stake + winnings),
  "total_odds": number (American format) or null,
  "legs": [
    {
      "team_or_player": "team/player name (required)",
      "opponent_or_context": "opponent or game description",
      "market_type": "Spread" | "Moneyline" | "Total" | "Player Prop" | "Team Total" | "Other",
      "side": "home" | "away" | "over" | "under" | null,
      "user_line_value": number (THE EXACT LINE/SPREAD/TOTAL - CRITICAL),
      "user_odds": number (American odds format),
      "sport": "NBA" | "NFL" | "MLB" | "NHL" | "NCAAB" | "NCAAF" | "Soccer" | "UFC" | "Tennis" | "Golf" | "Other",
      "league": "league name if visible",
      "game_date": "YYYY-MM-DD if visible" or null,
      "raw_text": "exact text from the bet slip for this leg",
      "confidence": {
        "overall": 0-100,
        "team_or_player": 0-100,
        "market_type": 0-100,
        "line_value": 0-100,
        "odds": 0-100,
        "sport": 0-100
      }
    }
  ],
  "parsing_notes": ["any observations about unclear elements"],
  "overall_confidence": 0-100,
  "needs_review": true/false,
  "review_reasons": ["reasons why manual review is needed"]
}

## CRITICAL RULES

### Line Values (user_line_value) - MOST IMPORTANT FIELD
- For SPREADS: Include the +/- sign. Examples: -3.5, +7, -1.5
- For TOTALS: The number is the total points line. Examples: 220.5, 47.5, 8.5
- For PLAYER PROPS: The stat line. Examples: 25.5 (points), 150.5 (passing yards)
- For MONEYLINE: Set to null (no line value needed)
- This MUST be the exact number the user bet at - different sportsbooks give different lines

### Odds Format (user_odds)
- Convert ALL odds to American format
- Favorites are NEGATIVE: -110, -150, -300
- Underdogs are POSITIVE: +120, +200, +500
- If you see decimal odds (1.91), convert: American = (decimal - 1) * 100 for underdogs, -100 / (decimal - 1) for favorites
- If you see fractional odds (5/6), convert appropriately

### Market Type Detection
- "Spread" / "Point Spread" / "Handicap" / "ATS" → Spread
- "Moneyline" / "ML" / "To Win" / "Match Winner" → Moneyline  
- "Over" / "Under" / "O/U" / "Total" → Total
- Player name + stat (PTS, REB, AST, Yards, etc.) → Player Prop
- "Team Total" / "Team Over" / "Team Under" → Team Total

### Side Detection
- For spreads: The team taking the points is the SELECTION. If you see "Lakers -3.5", the side is the Lakers.
- For totals: "Over 220.5" → side is "over", "Under 220.5" → side is "under"
- For moneyline: home/away based on matchup or null if unclear

### Confidence Scoring
- 100: Clearly visible, no ambiguity
- 80-99: Very confident, minor visual noise
- 60-79: Moderately confident, some inference needed
- 40-59: Low confidence, significant guessing
- 0-39: Very uncertain, likely wrong

### When to Flag for Review (needs_review = true)
- Any leg with overall confidence < 70
- Missing line values for spread/total bets
- Unable to identify sport
- Image quality issues
- Partial/cropped tickets

## SPORTSBOOK VARIATIONS TO HANDLE
Different books display data differently:
- Some show "+3.5 (-110)" (spread with odds)
- Some show "Lakers +3.5" separately from odds
- Some show "O 220.5 (-110)" for totals
- Some use "1H" or "1Q" for first half/quarter
- Props may show "LeBron James Points O 25.5"
- Parlays may show each leg separately or all on one line
- Same-game parlays (SGP) combine multiple legs from one game

## EXTRACTING FROM LOW-QUALITY IMAGES
- If text is blurry, make your best educated guess and lower confidence
- If odds are partially visible, estimate based on typical values (-110 is standard)
- If stake/payout visible but not odds, calculate the odds
- Always provide raw_text even if you're uncertain

Remember: The user_line_value is THE most critical field. Users need this exact number to track if their bet is covering.`;
}

/**
 * Parse a bet slip image using OpenAI Vision
 */
export async function parseBetSlip(
  imageBase64: string,
  imageType: string,
  openaiKey: string
): Promise<ParsedTicket> {
  const imageUrl = `data:${imageType};base64,${imageBase64}`;
  
  console.log('[BET PARSER] Starting universal bet slip parse');
  
  // First pass: Full analysis
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: buildUniversalParsePrompt() },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: 'Parse this bet slip with maximum accuracy. Focus especially on extracting the exact line values (spreads, totals, prop lines) as these are critical for tracking. Return the structured JSON.' 
            },
            { 
              type: 'image_url', 
              image_url: { 
                url: imageUrl,
                detail: 'high' // Use high detail for better OCR
              } 
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1, // Low temperature for consistent parsing
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[BET PARSER] OpenAI API error:', response.status, errorText);
    // Parse error for more details
    let errorDetail = `status ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorDetail = errorJson.error.message;
      }
    } catch {
      // Use raw text if not JSON
      if (errorText.length < 100) {
        errorDetail = errorText;
      }
    }
    throw new Error(`AI service error: ${errorDetail}`);
  }

  const aiResponse = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  
  const content = aiResponse.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  console.log('[BET PARSER] Raw AI response:', content.substring(0, 500));

  let parsed: ParsedTicket;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error('[BET PARSER] JSON parse error:', e);
    throw new Error('Failed to parse AI response as JSON');
  }

  // Post-process and validate
  parsed = postProcessParsedTicket(parsed);
  
  console.log('[BET PARSER] Parsed ticket:', {
    sportsbook: parsed.sportsbook,
    type: parsed.ticket_type,
    legs: parsed.legs.length,
    confidence: parsed.overall_confidence,
    needs_review: parsed.needs_review,
  });

  return parsed;
}

/**
 * Post-process parsed ticket for validation and normalization
 */
function postProcessParsedTicket(parsed: ParsedTicket): ParsedTicket {
  const notes: string[] = parsed.parsing_notes || [];
  const reviewReasons: string[] = parsed.review_reasons || [];
  
  // Ensure legs array exists
  if (!parsed.legs) {
    parsed.legs = [];
    reviewReasons.push('No legs detected in image');
  }

  // Process each leg
  parsed.legs = parsed.legs.map((leg, index) => {
    // Ensure confidence object exists
    if (!leg.confidence) {
      leg.confidence = {
        overall: 50,
        team_or_player: 50,
        market_type: 50,
        line_value: 50,
        odds: 50,
        sport: 50,
      };
      notes.push(`Leg ${index + 1}: No confidence scores provided, defaulting to 50%`);
    }

    // Validate line values for spreads and totals
    if ((leg.market_type === 'Spread' || leg.market_type === 'Total' || leg.market_type === 'Player Prop') 
        && leg.user_line_value === null) {
      reviewReasons.push(`Leg ${index + 1}: Missing line value for ${leg.market_type}`);
      leg.confidence.line_value = 0;
    }

    // Validate team/player exists
    if (!leg.team_or_player || leg.team_or_player === 'Unknown') {
      reviewReasons.push(`Leg ${index + 1}: Could not identify team/player`);
      leg.confidence.team_or_player = 0;
    }

    // Auto-detect sport if missing
    if (!leg.sport && leg.team_or_player) {
      leg.sport = detectSport(leg.team_or_player + ' ' + (leg.opponent_or_context || ''));
      if (leg.sport) {
        notes.push(`Leg ${index + 1}: Auto-detected sport as ${leg.sport}`);
        leg.confidence.sport = 70;
      }
    }

    // Normalize market type
    leg.market_type = normalizeMarketType(leg.market_type);

    // Calculate overall leg confidence
    const avgConfidence = Math.round(
      (leg.confidence.team_or_player + 
       leg.confidence.market_type + 
       leg.confidence.line_value + 
       leg.confidence.odds + 
       leg.confidence.sport) / 5
    );
    leg.confidence.overall = avgConfidence;

    // Flag low confidence legs
    if (avgConfidence < 70) {
      reviewReasons.push(`Leg ${index + 1}: Low confidence (${avgConfidence}%)`);
    }

    return leg;
  });

  // Calculate overall ticket confidence
  if (parsed.legs.length > 0) {
    const avgLegConfidence = parsed.legs.reduce((sum, leg) => sum + leg.confidence.overall, 0) / parsed.legs.length;
    const sportsbookConfidence = parsed.sportsbook_confidence || 50;
    parsed.overall_confidence = Math.round((avgLegConfidence * 0.8) + (sportsbookConfidence * 0.2));
  } else {
    parsed.overall_confidence = 0;
  }

  // Determine if review is needed
  parsed.needs_review = reviewReasons.length > 0 || parsed.overall_confidence < 70;
  parsed.review_reasons = [...new Set(reviewReasons)]; // Dedupe
  parsed.parsing_notes = [...new Set(notes)];

  // Normalize ticket type
  if (!parsed.ticket_type) {
    parsed.ticket_type = parsed.legs.length > 1 ? 'parlay' : 'single';
  }

  return parsed;
}

/**
 * Detect sport from text content
 */
function detectSport(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  for (const [sport, patterns] of Object.entries(SPORT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        return sport;
      }
    }
  }
  
  return null;
}

/**
 * Normalize market type to standard values
 */
function normalizeMarketType(marketType: string): ParsedLeg['market_type'] {
  const lower = marketType?.toLowerCase() || '';
  
  if (lower.includes('spread') || lower.includes('handicap') || lower === 'ats') {
    return 'Spread';
  }
  if (lower.includes('money') || lower === 'ml' || lower.includes('to win')) {
    return 'Moneyline';
  }
  if (lower.includes('total') || lower.includes('over') || lower.includes('under')) {
    return 'Total';
  }
  if (lower.includes('prop') || lower.includes('player')) {
    return 'Player Prop';
  }
  if (lower.includes('team total')) {
    return 'Team Total';
  }
  
  return 'Other';
}

/**
 * Try to identify sportsbook from parsed content
 */
export function identifySportsbook(text: string): { name: string; confidence: number } | null {
  const lowerText = text.toLowerCase();
  
  for (const book of SPORTSBOOK_SIGNATURES) {
    for (const pattern of book.patterns) {
      if (lowerText.includes(pattern)) {
        return { name: book.name, confidence: 90 };
      }
    }
  }
  
  return null;
}

/**
 * Convert decimal odds to American format
 */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

/**
 * Convert fractional odds to American format
 */
export function fractionalToAmerican(numerator: number, denominator: number): number {
  const decimal = (numerator / denominator) + 1;
  return decimalToAmerican(decimal);
}

/**
 * Second-pass verification for low-confidence legs
 * Re-analyzes specific legs with focused prompts to improve accuracy
 */
export async function verifyLowConfidenceLegs(
  imageBase64: string,
  imageType: string,
  ticket: ParsedTicket,
  openaiKey: string,
  confidenceThreshold: number = 70
): Promise<ParsedTicket> {
  // Find legs that need verification
  const lowConfidenceLegs = ticket.legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.confidence.overall < confidenceThreshold);

  if (lowConfidenceLegs.length === 0) {
    console.log('[BET PARSER] No legs need second-pass verification');
    return ticket;
  }

  console.log(`[BET PARSER] Running second-pass verification on ${lowConfidenceLegs.length} leg(s)`);

  const imageUrl = `data:${imageType};base64,${imageBase64}`;

  // Build focused verification prompt
  const verificationPrompt = buildVerificationPrompt(lowConfidenceLegs.map(l => l.leg));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: verificationPrompt },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Please verify and correct the following legs from this bet slip. Focus on the specific uncertain fields highlighted. Return a JSON array with the corrected data.` 
            },
            { 
              type: 'image_url', 
              image_url: { 
                url: imageUrl,
                detail: 'high'
              } 
            },
          ],
        },
      ],
      max_tokens: 3000,
      temperature: 0.05, // Even lower temperature for verification pass
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    console.error('[BET PARSER] Second-pass verification failed, keeping original data');
    ticket.parsing_notes.push('Second-pass verification failed, using original data');
    return ticket;
  }

  const aiResponse = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  
  const content = aiResponse.choices[0]?.message?.content;
  if (!content) {
    console.error('[BET PARSER] No content in second-pass response');
    return ticket;
  }

  console.log('[BET PARSER] Second-pass response:', content.substring(0, 300));

  try {
    const verifiedData = JSON.parse(content) as { legs: VerifiedLeg[] };
    
    if (!verifiedData.legs || !Array.isArray(verifiedData.legs)) {
      console.error('[BET PARSER] Invalid second-pass response structure');
      return ticket;
    }

    // Apply verified data back to the original ticket
    verifiedData.legs.forEach((verified, i) => {
      if (i < lowConfidenceLegs.length) {
        const originalIndex = lowConfidenceLegs[i].index;
        const originalLeg = ticket.legs[originalIndex];
        
        // Only update fields where second pass has higher confidence
        if (verified.confidence_improved) {
          // Update fields that were improved
          if (verified.team_or_player && verified.team_or_player_confidence > originalLeg.confidence.team_or_player) {
            ticket.legs[originalIndex].team_or_player = verified.team_or_player;
            ticket.legs[originalIndex].confidence.team_or_player = verified.team_or_player_confidence;
          }
          
          if (verified.market_type && verified.market_type_confidence > originalLeg.confidence.market_type) {
            ticket.legs[originalIndex].market_type = normalizeMarketType(verified.market_type);
            ticket.legs[originalIndex].confidence.market_type = verified.market_type_confidence;
          }
          
          if (verified.user_line_value !== null && verified.user_line_value !== undefined && verified.line_value_confidence > originalLeg.confidence.line_value) {
            ticket.legs[originalIndex].user_line_value = verified.user_line_value;
            ticket.legs[originalIndex].confidence.line_value = verified.line_value_confidence;
          }
          
          if (verified.user_odds !== null && verified.user_odds !== undefined && verified.odds_confidence > originalLeg.confidence.odds) {
            ticket.legs[originalIndex].user_odds = verified.user_odds;
            ticket.legs[originalIndex].confidence.odds = verified.odds_confidence;
          }
          
          if (verified.sport && verified.sport_confidence > originalLeg.confidence.sport) {
            ticket.legs[originalIndex].sport = verified.sport;
            ticket.legs[originalIndex].confidence.sport = verified.sport_confidence;
          }

          if (verified.side) {
            ticket.legs[originalIndex].side = verified.side;
          }

          // Recalculate overall confidence for this leg
          const leg = ticket.legs[originalIndex];
          leg.confidence.overall = Math.round(
            (leg.confidence.team_or_player + 
             leg.confidence.market_type + 
             leg.confidence.line_value + 
             leg.confidence.odds + 
             leg.confidence.sport) / 5
          );

          ticket.parsing_notes.push(`Leg ${originalIndex + 1}: Second-pass verification improved confidence to ${leg.confidence.overall}%`);
        }

        // Add any verification notes
        if (verified.notes) {
          ticket.parsing_notes.push(`Leg ${originalIndex + 1}: ${verified.notes}`);
        }
      }
    });

    // Recalculate overall ticket confidence
    if (ticket.legs.length > 0) {
      const avgLegConfidence = ticket.legs.reduce((sum, leg) => sum + leg.confidence.overall, 0) / ticket.legs.length;
      const sportsbookConfidence = ticket.sportsbook_confidence || 50;
      ticket.overall_confidence = Math.round((avgLegConfidence * 0.8) + (sportsbookConfidence * 0.2));
    }

    // Update needs_review based on new confidence levels
    const stillLowConfidenceLegs = ticket.legs.filter(leg => leg.confidence.overall < confidenceThreshold);
    if (stillLowConfidenceLegs.length > 0) {
      ticket.review_reasons = ticket.review_reasons.filter(r => !r.includes('Low confidence'));
      stillLowConfidenceLegs.forEach((leg, i) => {
        ticket.review_reasons.push(`Leg ${i + 1}: Still low confidence after verification (${leg.confidence.overall}%)`);
      });
    }
    ticket.needs_review = ticket.review_reasons.length > 0 || ticket.overall_confidence < confidenceThreshold;

    console.log('[BET PARSER] Second-pass complete. New overall confidence:', ticket.overall_confidence);

  } catch (e) {
    console.error('[BET PARSER] Error processing second-pass response:', e);
    ticket.parsing_notes.push('Second-pass verification encountered an error');
  }

  return ticket;
}

interface VerifiedLeg {
  team_or_player?: string;
  team_or_player_confidence: number;
  market_type?: string;
  market_type_confidence: number;
  user_line_value?: number | null;
  line_value_confidence: number;
  user_odds?: number | null;
  odds_confidence: number;
  sport?: string;
  sport_confidence: number;
  side?: 'home' | 'away' | 'over' | 'under' | null;
  confidence_improved: boolean;
  notes?: string;
}

/**
 * Build a focused verification prompt for low-confidence legs
 */
function buildVerificationPrompt(legs: ParsedLeg[]): string {
  const legDetails = legs.map((leg, i) => {
    const uncertainFields: string[] = [];
    
    if (leg.confidence.team_or_player < 70) {
      uncertainFields.push(`team_or_player (current: "${leg.team_or_player}", confidence: ${leg.confidence.team_or_player}%)`);
    }
    if (leg.confidence.market_type < 70) {
      uncertainFields.push(`market_type (current: "${leg.market_type}", confidence: ${leg.confidence.market_type}%)`);
    }
    if (leg.confidence.line_value < 70) {
      uncertainFields.push(`user_line_value (current: ${leg.user_line_value}, confidence: ${leg.confidence.line_value}%)`);
    }
    if (leg.confidence.odds < 70) {
      uncertainFields.push(`user_odds (current: ${leg.user_odds}, confidence: ${leg.confidence.odds}%)`);
    }
    if (leg.confidence.sport < 70) {
      uncertainFields.push(`sport (current: "${leg.sport}", confidence: ${leg.confidence.sport}%)`);
    }

    return `
Leg ${i + 1}:
- Raw text from slip: "${leg.raw_text}"
- Current parsed data: ${leg.team_or_player} ${leg.market_type} ${leg.user_line_value || ''} @ ${leg.user_odds}
- UNCERTAIN FIELDS TO VERIFY: ${uncertainFields.join(', ')}`;
  }).join('\n');

  return `You are a bet slip verification expert. Your job is to carefully re-examine specific legs from a bet slip image that had low confidence scores in the initial parse.

## LEGS TO VERIFY
${legDetails}

## YOUR TASK
Look at the bet slip image again and focus specifically on the uncertain fields listed above. Try to extract more accurate data.

## OUTPUT FORMAT
Return a JSON object:
{
  "legs": [
    {
      "team_or_player": "corrected value or null if unchanged",
      "team_or_player_confidence": 0-100,
      "market_type": "corrected value or null if unchanged",
      "market_type_confidence": 0-100,
      "user_line_value": corrected number or null,
      "line_value_confidence": 0-100,
      "user_odds": corrected American odds or null,
      "odds_confidence": 0-100,
      "sport": "corrected sport or null if unchanged",
      "sport_confidence": 0-100,
      "side": "home" | "away" | "over" | "under" | null,
      "confidence_improved": true/false (set true if you found better data),
      "notes": "explanation of what you found or why still uncertain"
    }
  ]
}

## VERIFICATION STRATEGIES
1. Look at different parts of the ticket (header, footer, leg details)
2. Use context clues (logos, colors, team matchup formatting)
3. Cross-reference visible information (if payout is visible, back-calculate odds)
4. For line values: look for numbers next to +/- signs or O/U indicators
5. For sports: team names, league logos, date formatting can help identify

## IMPORTANT
- Only set confidence_improved: true if you actually found better/clearer data
- Be honest about confidence - don't inflate scores
- If you can't improve the data, say so in the notes
- Focus on the UNCERTAIN FIELDS specifically`;
}

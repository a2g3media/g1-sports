import {
  CORE_POOL_TEMPLATES,
  POOL_TYPE_CATALOG,
  SUPPORTED_SPORTS,
  getCanonicalEvaluatorPoolType,
} from "../src/shared/poolTypeCatalog";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const REQUIRED_POOL_NAMES = [
  "NFL Pick'em Pool",
  "NFL ATS Pick'em",
  "NFL Confidence Pool",
  "NFL ATS Confidence Pool",
  "NFL Survivor Variants",
  "NFL Squares",
  "NFL Playoff Pool",
  "NFL Prop Pools",
  "NFL Margin of Victory Pool",
  "NFL Underdog Pool",
  "NFL Upset Pool",
  "NFL Streak Pool",
  "NFL SuperContest Style Pool",
  "NFL Total Points Pool",
  "NFL First Touchdown Pool",
  "College Football Top-25 Pick'em",
  "College Football ATS Pick'em",
  "College Football Confidence Pool",
  "College Football Upset Pool",
  "College Football Survivor Pool",
  "College Football Chaos Underdog Pool",
  "College Football Pick-6 Contest",
  "College Football Bowl Mania Pool",
  "College Football Bowl Game Pick'em",
  "March Madness Bracket Pool",
  "College Basketball Single Game Squares",
  "College Basketball Tournament Squares",
  "College Basketball Calcutta Pool",
  "NBA Pick'em Pool",
  "NBA ATS Pick'em",
  "NBA Streak Pool",
  "NBA Player Stat Pool",
  "NBA Survivor",
  "NBA Last Man Standing Nights",
  "NBA Playoff Bracket",
  "NBA Finals Squares",
  "MLB Pick'em",
  "MLB Survivor",
  "MLB Series Winner Pool",
  "MLB Run Line Pool",
  "MLB Streak Pool",
  "MLB Home Run Pool",
  "MLB Playoff Bracket",
  "MLB Beat the Streak Pool",
  "MLB Daily Dogfight Pool",
  "NHL Pick'em",
  "NHL Puck Line Pool",
  "NHL Survivor",
  "NHL Streak Pool",
  "NHL Goal Scorer Pool",
  "NHL Goalie Win Pool",
  "NHL Playoff Bracket",
  "NHL Shutout Pool",
  "NHL Overtime Chaos Pool",
  "Golf One & Done",
  "Golf Pick 3 / Pick 5",
  "Golf Survivor",
  "Golf Tournament Winner Pool",
  "Golf Birdie Pool",
  "Fight Card Pick'em",
  "MMA Method Pool",
  "MMA Round Prediction Pool",
  "MMA Survivor Pool",
  "MMA Finish Points Pool",
  "NASCAR Race Winner Pool",
  "NASCAR Top 5 Pool",
  "NASCAR Survivor",
  "NASCAR Manufacturer Pool",
  "NASCAR Pole Position Pool",
  "NASCAR Crash Pool",
  "World Cup Bracket",
  "Soccer Group Stage Pick'em",
  "Soccer Exact Score Pool",
  "Soccer Golden Boot Pool",
  "Soccer Tournament Survivor",
  "Soccer Goal Minute Pool",
  "Soccer Last Man Standing",
  "Soccer Big Upset Pool",
  "Mixed League Soccer Survivor",
  "All-Sport Survivor",
  "Bundle Pool",
];

async function main() {
  console.log("=== Pools Catalog Contract Gates ===");
  assert(SUPPORTED_SPORTS.length >= 11, "supported sports list is incomplete");
  assert(CORE_POOL_TEMPLATES.length >= 13, "core pool template list is incomplete");
  assert(POOL_TYPE_CATALOG.length >= REQUIRED_POOL_NAMES.length, "catalog entry count is lower than required");

  const names = new Set(POOL_TYPE_CATALOG.map((item) => item.name));
  for (const requiredName of REQUIRED_POOL_NAMES) {
    assert(names.has(requiredName), `missing catalog pool type: ${requiredName}`);
  }

  for (const poolType of POOL_TYPE_CATALOG) {
    const evaluatorType = getCanonicalEvaluatorPoolType(poolType.key);
    assert(Boolean(evaluatorType), `missing evaluator mapping for ${poolType.key}`);
    assert(poolType.rule_variants.length > 0, `missing rule variants for ${poolType.key}`);
    assert(poolType.commissioner_options.length > 0, `missing commissioner options for ${poolType.key}`);
  }

  console.log(`PASS catalog_count=${POOL_TYPE_CATALOG.length}`);
  console.log(`PASS required_names=${REQUIRED_POOL_NAMES.length}`);
  console.log("Pools catalog contract gates passed");
}

main().catch((err) => {
  console.error("Pools catalog contract gates failed:", err);
  process.exit(1);
});

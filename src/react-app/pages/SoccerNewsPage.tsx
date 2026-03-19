/**
 * SoccerNewsPage.tsx - Soccer Headlines & Coach G Analysis
 * Stub page for Step 2
 */

import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function SoccerNewsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/sports/soccer"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Soccer
        </Link>

        <div className="text-center py-20">
          <h1 className="text-3xl font-bold text-white mb-4">
            Soccer Headlines
          </h1>
          <p className="text-white/60 text-lg">
            Coming in Step 2 - Coach G World Football Brief and trending stories
          </p>
        </div>
      </div>
    </div>
  );
}

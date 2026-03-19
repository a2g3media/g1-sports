import { useNavigate, useParams } from "react-router-dom";
import { MMAEventDetail } from "@/react-app/components/MMAEventDetail";

export default function MMAEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">Event not found</p>
          <button
            onClick={() => navigate("/sports/mma")}
            className="mt-4 px-4 py-2 rounded-lg bg-red-500 text-white"
          >
            Back to MMA Hub
          </button>
        </div>
      </div>
    );
  }
  return <MMAEventDetail eventId={eventId} />;
}

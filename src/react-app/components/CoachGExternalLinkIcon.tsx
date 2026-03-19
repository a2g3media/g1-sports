import { ExternalLink } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface CoachGExternalLinkIconProps {
  className?: string;
}

export function CoachGExternalLinkIcon({ className }: CoachGExternalLinkIconProps) {
  return <ExternalLink aria-hidden="true" className={cn("h-3 w-3 opacity-80", className)} />;
}

export default CoachGExternalLinkIcon;

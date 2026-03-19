
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { Construction } from "lucide-react";

interface AdminPlaceholderProps {
  title: string;
  description: string;
}

export function AdminPlaceholder({ title, description }: AdminPlaceholderProps) {
  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title={title}
        description={description}
      />

      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This section is under development. The full {title.toLowerCase()} functionality 
            will be available in an upcoming release.
          </p>
        </div>
      </div>
    </div>
  );
}

// Concrete placeholder pages
export function AdminNotifications() {
  return (
    <AdminPlaceholder
      title="Notifications Health"
      description="Monitor notification delivery and failures"
    />
  );
}






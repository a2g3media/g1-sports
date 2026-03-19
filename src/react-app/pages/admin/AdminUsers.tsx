import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminDataTable } from "@/react-app/components/admin/AdminDataTable";
import { AdminStatusBadge } from "@/react-app/components/admin/AdminStatusBadge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface User {
  id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  roles: string[];
  status: string;
  subscription_status: string;
  pools_joined: number;
  pools_managed: number;
  last_active_at: string | null;
  created_at: string;
}

export function AdminUsers() {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });
      if (search) {
        params.set("search", search);
      }

      const headers: HeadersInit = {};
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        setUsers(result.users);
        setHasMore(result.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, isDemoMode]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchUsers();
    }, search ? 300 : 0);

    return () => clearTimeout(debounce);
  }, [fetchUsers]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const columns = [
    {
      key: "email",
      label: "User",
      render: (user: User) => (
        <div>
          <p className="font-medium">{user.display_name || user.email.split("@")[0]}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Roles",
      render: (user: User) => (
        <div className="flex flex-wrap gap-1">
          {(user.roles || ["player"]).map((role) => (
            <span
              key={role}
              className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-secondary text-secondary-foreground"
            >
              {role}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "pools_joined",
      label: "Pools",
      className: "text-center",
      render: (user: User) => (
        <div className="text-center">
          <p className="font-medium tabular-nums">{user.pools_joined}</p>
          <p className="text-[10px] text-muted-foreground">{user.pools_managed} managed</p>
        </div>
      ),
    },
    {
      key: "subscription_status",
      label: "Subscription",
      render: (user: User) => (
        <AdminStatusBadge status={user.subscription_status || "free"} />
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (user: User) => (
        <AdminStatusBadge status={user.status || "active"} />
      ),
    },
    {
      key: "last_active_at",
      label: "Last Active",
      render: (user: User) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(user.last_active_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Users"
        description="Global user registry"
      />

      <div className="p-6">
        <AdminDataTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          emptyMessage="No users found"
          searchPlaceholder="Search by name or email..."
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          page={page}
          hasMore={hasMore}
          onPageChange={setPage}
          onRowClick={(user) => navigate(`/admin/users/${user.id}`)}
        />
      </div>
    </div>
  );
}

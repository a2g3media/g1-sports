import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminDataTable } from "@/react-app/components/admin/AdminDataTable";
import { AdminStatusBadge } from "@/react-app/components/admin/AdminStatusBadge";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

interface Pool {
  id: string;
  name: string;
  sport_key: string;
  format_key: string;
  pool_type_id: number | null;
  pool_type_version: string | null;
  is_active: number;
  member_count: number;
  owner_emails: string | null;
  entry_fee_cents: number | null;
  created_at: string;
}

export function AdminPools() {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchPools = useCallback(async () => {
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

      const response = await fetch(`/api/admin/pools?${params}`, {
        credentials: "include",
        headers,
      });
      if (response.ok) {
        const result = await response.json();
        setPools(result.pools);
        setHasMore(result.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, isDemoMode]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPools();
    }, search ? 300 : 0);

    return () => clearTimeout(debounce);
  }, [fetchPools]);

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "Free";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const columns = [
    {
      key: "name",
      label: "Pool",
      render: (pool: Pool) => (
        <div>
          <p className="font-medium">{pool.name}</p>
          <p className="text-xs text-muted-foreground">
            {pool.sport_key?.toUpperCase()} - {pool.format_key}
          </p>
        </div>
      ),
    },
    {
      key: "owner_emails",
      label: "Admins",
      render: (pool: Pool) => (
        <span className="text-xs text-muted-foreground">
          {pool.owner_emails?.split(",")[0] || "—"}
        </span>
      ),
    },
    {
      key: "member_count",
      label: "Members",
      className: "text-center",
      render: (pool: Pool) => (
        <span className="font-medium tabular-nums">{pool.member_count}</span>
      ),
    },
    {
      key: "entry_fee_cents",
      label: "Entry Fee",
      render: (pool: Pool) => (
        <span className="text-sm">{formatCurrency(pool.entry_fee_cents)}</span>
      ),
    },
    {
      key: "pool_type_version",
      label: "Type Version",
      render: (pool: Pool) => (
        <span className="text-xs text-muted-foreground">
          {pool.pool_type_version || "—"}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      render: (pool: Pool) => (
        <AdminStatusBadge status={pool.is_active ? "active" : "inactive"} />
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Pools"
        description="Global pool oversight"
      />

      <div className="p-6">
        <AdminDataTable
          columns={columns}
          data={pools}
          isLoading={isLoading}
          emptyMessage="No pools found"
          searchPlaceholder="Search pools..."
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          page={page}
          hasMore={hasMore}
          onPageChange={setPage}
          onRowClick={(pool) => navigate(`/admin/pools/${pool.id}`)}
        />
      </div>
    </div>
  );
}

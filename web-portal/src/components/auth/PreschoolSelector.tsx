"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Organization {
  id: string;
  name: string;
  type: string | null; // preschool, k12_school, university, aftercare, etc.
  description: string | null;
  address: string | null;
  logo_url: string | null;
  website: string | null; // Changed from website_url
  phone: string | null;
  email: string | null;
}

interface OrganizationSelectorProps {
  onSelect: (organization: Organization | null) => void;
  selectedOrganizationId: string | null;
}

export default function OrganizationSelector({
  onSelect,
  selectedOrganizationId,
}: OrganizationSelectorProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrganizations, setFilteredOrganizations] = useState<Organization[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    let filtered = organizations;

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((o) => o.type === typeFilter);
    }

    // Apply search query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.name.toLowerCase().includes(query) ||
          o.address?.toLowerCase().includes(query) ||
          o.description?.toLowerCase().includes(query) ||
          o.type?.toLowerCase().includes(query)
      );
    }

    setFilteredOrganizations(filtered);
  }, [searchQuery, organizations, typeFilter]);

  async function fetchOrganizations() {
    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Query organizations table
      const { data, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name, type, description, address_line1, city, logo_url, website, phone, email")
        .eq("is_public", true)
        .eq("accepting_registrations", true)
        .eq("is_active", true)
        .order("name");

      if (fetchError) throw fetchError;

      console.log('[OrganizationSelector] Fetched organizations:', data);
      console.log('[OrganizationSelector] Data count:', data?.length || 0);

      // Transform data to match interface
      const transformed = (data || []).map((org: any) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        description: org.description,
        address: org.address_line1 && org.city ? `${org.address_line1}, ${org.city}` : org.address_line1,
        logo_url: org.logo_url,
        website: org.website,
        phone: org.phone,
        email: org.email,
      }));

      console.log('[OrganizationSelector] Transformed organizations:', transformed);

      setOrganizations(transformed);
      setFilteredOrganizations(transformed);
      
      console.log('[OrganizationSelector] State updated, count:', transformed.length);
    } catch (err: any) {
      console.error("Error fetching organizations:", err);
      setError(err.message || "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  const selectedOrganization = organizations.find((o) => o.id === selectedOrganizationId);

  const handleSelect = (organization: Organization) => {
    onSelect(organization);
    setShowDropdown(false);
    setSearchQuery("");
    setTypeFilter("all"); // Reset filter when selecting
  };

  // Get unique organization types for filter
  const availableTypes = Array.from(new Set(organizations.map(o => o.type).filter(Boolean)));

  const handleClickOutside = (e: React.MouseEvent) => {
    if (showDropdown && e.target === e.currentTarget) {
      setShowDropdown(false);
    }
  };

  // Helper to format organization type for display
  const formatOrgType = (type: string | null) => {
    if (!type) return "";
    const typeMap: Record<string, string> = {
      preschool: "Preschool",
      k12_school: "K-12 School",
      university: "University",
      corporate: "Corporate",
      sports_club: "Sports Club",
      community_org: "Community Org",
      training_center: "Training Center",
      tutoring_center: "Tutoring Center",
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF" }}>
        Loading organizations...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 12,
          background: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: 8,
        }}
      >
        <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <label
        style={{
          display: "block",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        Select Organization <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(Optional)</span>
        <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 12, display: "block", marginTop: 4 }}>
          (Preschool, School, Aftercare, Training Center, etc.)
        </span>
      </label>

      {/* Selected organization display (collapsed) */}
      {selectedOrganization ? (
        <div
          style={{
            padding: "12px 14px",
            background: "#1a1a1f",
            border: "1px solid #2a2a2f",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onClick={() => setShowDropdown(true)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 500, marginBottom: 4 }}>
              {selectedOrganization.name}
              {selectedOrganization.type && (
                <span style={{ color: "#00f5ff", fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
                  ({formatOrgType(selectedOrganization.type)})
                </span>
              )}
            </div>
            {selectedOrganization.address && (
              <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                {selectedOrganization.address}
              </div>
            )}
          </div>
          <button
            type="button"
            style={{
              background: "none",
              border: 0,
              color: "#00f5ff",
              cursor: "pointer",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: "12px 14px",
            background: "#1a1a1f",
            border: "1px solid #2a2a2f",
            borderRadius: 8,
            cursor: "pointer",
            color: "#9CA3AF",
          }}
          onClick={() => setShowDropdown(true)}
        >
          Click to select an organization...
        </div>
      )}

      {/* Dropdown overlay */}
      {showDropdown && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 9998,
          }}
          onClick={handleClickOutside}
        />
      )}

      {/* Dropdown modal */}
      {showDropdown && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 600,
            maxHeight: "80vh",
            background: "#1a1a1f",
            border: "1px solid #2a2a2f",
            borderRadius: 12,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header with search and filter */}
          <div style={{ padding: 16, borderBottom: "1px solid #2a2a2f" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 18 }}>Select Organization</h3>
              <button
                onClick={() => setShowDropdown(false)}
                style={{
                  background: "none",
                  border: 0,
                  color: "#9CA3AF",
                  cursor: "pointer",
                  fontSize: 24,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ?
              </button>
            </div>
            
            {/* Search input */}
            <input
              type="text"
              placeholder="Search by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#111113",
                border: "1px solid #2a2a2f",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            {/* Type filter */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setTypeFilter("all")}
                style={{
                  padding: "6px 12px",
                  background: typeFilter === "all" ? "#00f5ff" : "#2a2a2f",
                  color: typeFilter === "all" ? "#000" : "#9CA3AF",
                  border: 0,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: typeFilter === "all" ? 600 : 400,
                }}
              >
                All ({organizations.length})
              </button>
              {availableTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type || '')}
                  style={{
                    padding: "6px 12px",
                    background: typeFilter === type ? "#00f5ff" : "#2a2a2f",
                    color: typeFilter === type ? "#000" : "#9CA3AF",
                    border: 0,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: typeFilter === type ? 600 : 400,
                  }}
                >
                  {formatOrgType(type)} ({organizations.filter(o => o.type === type).length})
                </button>
              ))}
            </div>
          </div>

          {/* Organization list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
            }}
          >

            {filteredOrganizations.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "#9CA3AF" }}>
                No organizations found
              </div>
            ) : (
              filteredOrganizations.map((organization) => (
                <div
                  key={organization.id}
                  onClick={() => handleSelect(organization)}
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #2a2a2f",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#252529";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {organization.logo_url && (
                      <img
                        src={organization.logo_url}
                        alt={organization.name}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            objectFit: "cover",
                          }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "#fff",
                            fontWeight: 500,
                            marginBottom: 4,
                          }}
                        >
                          {organization.name}
                          {organization.type && (
                            <span style={{ color: "#00f5ff", fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
                              ({formatOrgType(organization.type)})
                            </span>
                          )}
                        </div>
                        {organization.address && (
                          <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                            {organization.address}
                          </div>
                        )}
                        {organization.description && (
                          <div
                            style={{
                              color: "#9CA3AF",
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            {organization.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        </div>
      )}

      <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        Your request will be sent to the organization for approval
      </p>
    </div>
  );
}

// Database types for the Supabase client.
//
// Hand-written to match supabase/migrations/20261127000001_foundation.sql, in the same shape
// `supabase gen types` produces. Once a Supabase project is linked, REPLACE this file with
// `npm run db:types` and keep it generated from then on.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; default_currency: string; timezone: string; locale: string } & Timestamps;
        Insert: { id?: string; name: string; slug: string; default_currency?: string; timezone?: string; locale?: string; created_at?: string; updated_at?: string };
        Update: { name?: string; default_currency?: string; timezone?: string; locale?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; email: string; full_name: string | null; avatar_url: string | null; locale: string | null } & Timestamps;
        Insert: { id: string; email: string; full_name?: string | null; avatar_url?: string | null; locale?: string | null };
        Update: { full_name?: string | null; avatar_url?: string | null; locale?: string | null };
        Relationships: [];
      };
      memberships: {
        Row: { id: string; organization_id: string; user_id: string; role: Database["public"]["Enums"]["org_role"]; title: string | null } & Timestamps;
        Insert: { id?: string; organization_id: string; user_id: string; role: Database["public"]["Enums"]["org_role"]; title?: string | null };
        Update: { role?: Database["public"]["Enums"]["org_role"]; title?: string | null };
        Relationships: [
          { foreignKeyName: "memberships_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "memberships_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          legal_name: string | null;
          website: string | null;
          domain: string | null;
          industry: string | null;
          status: Database["public"]["Enums"]["client_status"];
          owner_id: string | null;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          legal_name?: string | null;
          website?: string | null;
          domain?: string | null;
          industry?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          owner_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          legal_name?: string | null;
          website?: string | null;
          domain?: string | null;
          industry?: string | null;
          status?: Database["public"]["Enums"]["client_status"];
          owner_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          title: string | null;
          is_primary: boolean;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          is_primary?: boolean;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: { full_name?: string; email?: string | null; phone?: string | null; title?: string | null; is_primary?: boolean; notes?: string | null };
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          name: string;
          description: string | null;
          status: Database["public"]["Enums"]["project_status"];
          owner_id: string | null;
          start_date: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          name: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          owner_id?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          client_id?: string;
          name?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          owner_id?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      project_members: {
        Row: { organization_id: string; project_id: string; user_id: string; added_by: string | null; added_at: string };
        Insert: { organization_id: string; project_id: string; user_id: string; added_by?: string | null; added_at?: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "project_members_organization_id_project_id_fkey";
            columns: ["organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          organization_id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          changes: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      project_finances: {
        Row: {
          project_id: string;
          organization_id: string;
          currency: string;
          contract_cents: number;
          tax_rate_bps: number | null;
          tax_cents: number | null;
          collected_cents: number | null;
          outstanding_cents: number;
          invoice_ref: string | null;
          payment_due_date: string | null;
          origination_bps: number;
          delivery_bps: number;
          as_of: string;
          source: string;
          notes: string | null;
        } & Timestamps;
        Insert: {
          project_id: string;
          organization_id: string;
          currency?: string;
          contract_cents: number;
          tax_rate_bps?: number | null;
          collected_cents?: number | null;
          outstanding_cents: number;
          invoice_ref?: string | null;
          payment_due_date?: string | null;
          origination_bps?: number;
          delivery_bps?: number;
          as_of: string;
          source: string;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["project_finances"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "project_finances_organization_id_project_id_fkey";
            columns: ["organization_id", "project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      partners: {
        Row: { id: string; organization_id: string; full_name: string; email: string | null; user_id: string | null } & Timestamps;
        Insert: { id?: string; organization_id: string; full_name: string; email?: string | null; user_id?: string | null };
        Update: { full_name?: string; email?: string | null; user_id?: string | null };
        Relationships: [];
      };
      project_splits: {
        Row: { organization_id: string; project_id: string; partner_id: string; role: Database["public"]["Enums"]["split_role"]; share_bps: number };
        Insert: { organization_id: string; project_id: string; partner_id: string; role: Database["public"]["Enums"]["split_role"]; share_bps: number };
        Update: { share_bps?: number };
        Relationships: [
          {
            foreignKeyName: "project_splits_organization_id_partner_id_fkey";
            columns: ["organization_id", "partner_id"];
            isOneToOne: false;
            referencedRelation: "partners";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "project_splits_organization_id_project_id_fkey";
            columns: ["organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      partner_payouts: {
        Row: {
          id: string;
          organization_id: string;
          partner_id: string;
          amount_cents: number;
          currency: string;
          paid_month: string | null;
          description: string;
          source: string;
          import_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          partner_id: string;
          amount_cents: number;
          currency?: string;
          paid_month?: string | null;
          description: string;
          source: string;
          import_key?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["partner_payouts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "partner_payouts_organization_id_partner_id_fkey";
            columns: ["organization_id", "partner_id"];
            isOneToOne: false;
            referencedRelation: "partners";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      financial_snapshots: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          title: string;
          basis: "accrual" | "cash";
          period_start: string;
          period_end: string;
          reconciled_through: string | null;
          currency: string;
          source: string;
          audience: "finance" | "admins";
          data: Json;
          imported_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          title: string;
          basis: "accrual" | "cash";
          period_start: string;
          period_end: string;
          reconciled_through?: string | null;
          currency?: string;
          source: string;
          audience?: "finance" | "admins";
          data: Json;
          imported_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["financial_snapshots"]["Insert"]>;
        Relationships: [];
      };
      pipeline_stages: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          name: string;
          kind: Database["public"]["Enums"]["stage_kind"];
          position: number;
          probability_bps: number;
          created_at: string;
        };
        Insert: never;
        Update: { name?: string; position?: number; probability_bps?: number };
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          contact_id: string | null;
          title: string;
          stage_id: string;
          value_cents: number | null;
          currency: string;
          owner_id: string | null;
          source: Database["public"]["Enums"]["lead_source"];
          source_detail: string | null;
          brought_by_partner_id: string | null;
          brought_by_kind: Database["public"]["Enums"]["origination_kind"] | null;
          expected_close_on: string | null;
          next_follow_up_on: string | null;
          closed_on: string | null;
          lost_reason: string | null;
          won_project_id: string | null;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          contact_id?: string | null;
          title: string;
          stage_id: string;
          value_cents?: number | null;
          currency?: string;
          owner_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
          source_detail?: string | null;
          brought_by_partner_id?: string | null;
          brought_by_kind?: Database["public"]["Enums"]["origination_kind"] | null;
          expected_close_on?: string | null;
          next_follow_up_on?: string | null;
          closed_on?: string | null;
          lost_reason?: string | null;
          won_project_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["opportunities"]["Insert"], "organization_id">>;
        Relationships: [
          {
            foreignKeyName: "opportunities_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "opportunities_organization_id_stage_id_fkey";
            columns: ["organization_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "opportunities_contact_fk";
            columns: ["organization_id", "client_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["organization_id", "client_id", "id"];
          },
          {
            foreignKeyName: "opportunities_organization_id_brought_by_partner_id_fkey";
            columns: ["organization_id", "brought_by_partner_id"];
            isOneToOne: false;
            referencedRelation: "partners";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      activities: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          opportunity_id: string | null;
          kind: Database["public"]["Enums"]["activity_kind"];
          body: string;
          occurred_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          opportunity_id?: string | null;
          kind?: Database["public"]["Enums"]["activity_kind"];
          body: string;
          occurred_at?: string;
          created_by?: string | null;
        };
        Update: { body?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      org_role: "admin" | "project_manager" | "team" | "finance" | "marketing";
      client_status: "prospect" | "active" | "inactive";
      project_status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      split_role: "origination" | "delivery";
      stage_kind: "open" | "won" | "lost";
      origination_kind: "partner" | "gufi" | "none";
      lead_source: "referral" | "partner" | "website" | "outbound" | "marketing" | "existing_client" | "other";
      activity_kind: "note" | "call" | "email" | "meeting" | "stage_change";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

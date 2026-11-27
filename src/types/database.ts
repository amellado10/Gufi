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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      org_role: "admin" | "project_manager" | "team" | "finance" | "marketing";
      client_status: "prospect" | "active" | "inactive";
      project_status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

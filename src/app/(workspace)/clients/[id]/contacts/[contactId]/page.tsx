import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteContactAction, updateContactAction } from "@/features/clients/actions";
import { ContactForm } from "@/features/clients/contact-form";
import { buttonClass } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/clients/[id]/contacts/[contactId]">) {
  const ws = await requirePermission("contacts:write");
  const { id, contactId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(contactId).success) notFound();
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, client:clients(id, name)")
    .eq("organization_id", ws.organization.id)
    .eq("client_id", id)
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) notFound();
  const client = contact.client as unknown as { id: string; name: string } | null;
  const placeholder = contact.email?.endsWith("@example.com");

  return (
    <>
      <PageHeader back={{ href: `/clients/${id}`, label: client?.name ?? "Client" }} title="Edit contact" />
      <Card className="max-w-3xl">
        {placeholder && (
          <p className="mb-5 rounded-md border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-sm">
            This is a placeholder contact. Replace the name, email and title with the real person.
          </p>
        )}
        <ContactForm
          action={updateContactAction.bind(null, id, contactId)}
          defaults={{ full_name: contact.full_name, email: contact.email, phone: contact.phone, title: contact.title }}
          submitLabel="Save contact"
        />
        <form action={deleteContactAction.bind(null, id, contactId)} className="mt-6 border-t border-border pt-5">
          <button type="submit" className={buttonClass("danger", "sm")}>
            Delete this contact
          </button>
        </form>
      </Card>
    </>
  );
}

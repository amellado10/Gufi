import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState icon={SearchX} title="Not found" action={<ButtonLink href="/" variant="secondary">Back to overview</ButtonLink>}>
      It doesn&apos;t exist, or your role doesn&apos;t include it.
    </EmptyState>
  );
}

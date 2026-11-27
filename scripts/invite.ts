// Invite a person to a workspace, or change their role.
//
//   npm run invite -- --org gufi --email person@example.com --role project_manager [--name "Full Name"] [--title "Designer"]
//
// Roles: admin, project_manager, team, finance, marketing (see src/lib/roles.ts).
import { adminClient, arg, inviteOrFind, parseRole } from "./_admin";

async function main() {
  const slug = arg("org");
  const email = arg("email");
  const role = parseRole(arg("role"));
  if (!slug || !email) {
    console.error("Usage: npm run invite -- --org <slug> --email <email> --role <role> [--name <full name>] [--title <job title>]");
    process.exit(1);
  }
  const supabase = adminClient();
  const { data: org, error: orgError } = await supabase.from("organizations").select("id, name").eq("slug", slug).maybeSingle();
  if (orgError) throw orgError;
  if (!org) {
    console.error(`No organization with slug "${slug}". Run npm run bootstrap first.`);
    process.exit(1);
  }
  const user = await inviteOrFind(supabase, email, arg("name"));
  const { error } = await supabase
    .from("memberships")
    .upsert({ organization_id: org.id, user_id: user.id, role, title: arg("title") ?? null }, { onConflict: "organization_id,user_id" });
  if (error) throw error;
  console.log(`${user.invited ? "Invited" : "Updated"} ${email} as ${role} in ${org.name}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

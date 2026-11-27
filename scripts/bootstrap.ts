// One-time setup of a workspace and its first admin.
//
//   npm run bootstrap -- --name "Güfi" --slug gufi --timezone America/Puerto_Rico \
//     --currency USD --admin founder@example.com --admin-name "Founder Name"
//
// Safe to re-run: the organization is matched by slug and the membership is upserted.
import { adminClient, arg, inviteOrFind } from "./_admin";

async function main() {
  const name = arg("name");
  const slug = arg("slug");
  const adminEmail = arg("admin");
  const timezone = arg("timezone") ?? "UTC";
  const currency = (arg("currency") ?? "USD").toUpperCase();
  if (!name || !slug || !adminEmail) {
    console.error('Usage: npm run bootstrap -- --name "Güfi" --slug gufi --admin you@example.com [--admin-name "Name"] [--timezone Area/City] [--currency USD]');
    process.exit(1);
  }
  if (timezone !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(timezone)) {
    console.error(`Unknown time zone: ${timezone}`);
    process.exit(1);
  }

  const supabase = adminClient();
  const { data: existing } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
  let orgId = existing?.id;
  if (!orgId) {
    const { data, error } = await supabase.from("organizations").insert({ name, slug, timezone, default_currency: currency }).select("id").single();
    if (error) throw error;
    orgId = data.id;
    console.log(`Created organization "${name}" (${slug})`);
  } else {
    console.log(`Organization "${slug}" already exists; keeping it`);
  }

  const user = await inviteOrFind(supabase, adminEmail, arg("admin-name"));
  const { error } = await supabase.from("memberships").upsert({ organization_id: orgId, user_id: user.id, role: "admin" }, { onConflict: "organization_id,user_id" });
  if (error) throw error;
  console.log(user.invited ? `Invitation sent to ${adminEmail} (admin)` : `${adminEmail} is now an admin`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import { createClient } from "npm:@supabase/supabase-js@2";

const roles = new Set(["admin", "finance", "offline_sales", "online_sales"]);
const origins = new Set([
  "https://trueartis.tech",
  "https://www.trueartis.tech",
  "http://localhost:5173",
]);

const headers = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://trueartis.tech",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
};

const respond = (request: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: headers(request) });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) });
  if (request.method !== "POST") return respond(request, 405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !authorization) {
    return respond(request, 401, { error: "Authentication is required" });
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return respond(request, 401, { error: "Your session has expired. Sign in again." });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: roleError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (roleError || callerProfile?.role !== "admin") {
    return respond(request, 403, { error: "Administrator access is required." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return respond(request, 400, { error: "Invalid request." });
  }

  const role = typeof body.role === "string" ? body.role : "";
  if (!roles.has(role)) return respond(request, 400, { error: "Choose a valid access role." });

  if (body.action === "update-role") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return respond(request, 400, { error: "User is required." });
    if (userId === userData.user.id && role !== "admin") {
      return respond(request, 400, { error: "Your own Administrator role is protected." });
    }
    const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
    if (error) return respond(request, 400, { error: error.message });
    return respond(request, 200, { ok: true });
  }

  if (body.action === "create-user") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!email || !email.includes("@")) return respond(request, 400, { error: "Enter a valid email address." });
    if (password.length < 8) return respond(request, 400, { error: "Password must contain at least 8 characters." });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email },
    });
    if (error || !data.user) return respond(request, 400, { error: error?.message || "Could not create the account." });

    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName || email,
      role,
    });
    if (profileError) return respond(request, 400, { error: profileError.message });
    return respond(request, 201, { id: data.user.id });
  }

  return respond(request, 400, { error: "Unsupported action." });
});

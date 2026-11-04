import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Invitation service is not configured" }, 500);
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await request.json();
    const action = body.action as string;
    const user = authData.user;

    if (action === "create") {
      const memberId = String(body.projectMemberId ?? "");
      if (!memberId) return json({ error: "A team member is required" }, 400);

      const { data: member, error: memberError } = await admin
        .from("project_members")
        .select("id, project_id, user_id, is_leader, status")
        .eq("id", memberId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) return json({ error: "Team member not found" }, 404);

      const { data: project, error: projectError } = await admin
        .from("projects")
        .select("leader_id")
        .eq("id", member.project_id)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project || project.leader_id !== user.id) {
        return json({ error: "Only the project leader can create invitations" }, 403);
      }
      if (member.is_leader || member.status === "accepted" || member.user_id) {
        return json({ error: "This team member does not need an invitation" }, 409);
      }

      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const invitationToken = btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const tokenHash = await hashToken(invitationToken);

      const { error: revokeError } = await admin
        .from("invitations")
        .update({ claim_status: "revoked", revoked_at: new Date().toISOString() })
        .eq("project_member_id", member.id)
        .eq("claim_status", "pending");
      if (revokeError) throw revokeError;

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error: insertError } = await admin
        .from("invitations")
        .insert({
          project_id: member.project_id,
          project_member_id: member.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_by: user.id,
        })
        .select("id, expires_at")
        .single();
      if (insertError) throw insertError;

      return json({ invitationId: invitation.id, token: invitationToken, expiresAt });
    }

    if (action === "verify" || action === "claim") {
      const invitationToken = String(body.token ?? "");
      if (invitationToken.length < 32 || invitationToken.length > 128) {
        return json({ error: "Invitation is invalid or expired" }, 400);
      }
      const tokenHash = await hashToken(invitationToken);
      if (action === "verify") {
        const { data, error } = await admin.rpc("preview_project_invitation", {
          p_token_hash: tokenHash,
          p_user_email: user.email ?? "",
        });
        if (error) return json({ error: error.message }, 400);
        return json({ invitation: data });
      }

      const { data, error } = await admin.rpc("claim_project_invitation", {
        p_token_hash: tokenHash,
        p_user_id: user.id,
        p_user_email: user.email ?? "",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ invitation: data });
    }

    if (action === "status") {
      const projectId = String(body.projectId ?? "");
      if (!projectId) return json({ error: "A project is required" }, 400);

      const { data: project, error: projectError } = await admin
        .from("projects")
        .select("leader_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project || project.leader_id !== user.id) {
        return json({ error: "Only the project leader can view invitation status" }, 403);
      }

      const { data: invitations, error: invitationError } = await admin
        .from("invitations")
        .select("id, project_member_id, claim_status, expires_at, claimed_at, revoked_at, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (invitationError) throw invitationError;
      return json({
        invitations: (invitations ?? []).map((invitation) => ({
          ...invitation,
          claim_status: invitation.claim_status === "pending"
            && new Date(invitation.expires_at).getTime() <= Date.now()
            ? "expired"
            : invitation.claim_status,
        })),
      });
    }

    if (action === "revoke") {
      const invitationId = String(body.invitationId ?? "");
      const { data: invitation, error: invitationError } = await admin
        .from("invitations")
        .select("id, project_id, claim_status")
        .eq("id", invitationId)
        .maybeSingle();
      if (invitationError) throw invitationError;
      if (!invitation) return json({ error: "Invitation not found" }, 404);

      const { data: project, error: projectError } = await admin
        .from("projects")
        .select("leader_id")
        .eq("id", invitation.project_id)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project || project.leader_id !== user.id) {
        return json({ error: "Only the project leader can revoke invitations" }, 403);
      }
      if (invitation.claim_status !== "pending") {
        return json({ error: "Only a pending invitation can be revoked" }, 409);
      }

      const { error: updateError } = await admin
        .from("invitations")
        .update({ claim_status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("claim_status", "pending");
      if (updateError) throw updateError;
      return json({ revoked: true });
    }

    return json({ error: "Unsupported invitation action" }, 400);
  } catch (error) {
    console.error("Invitation request failed", error);
    return json({ error: error instanceof Error ? error.message : "Invitation request failed" }, 500);
  }
});

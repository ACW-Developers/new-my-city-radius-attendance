import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Auto checkout any open shift. Designed to be invoked by pg_cron at 18:00 America/Phoenix daily.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Today in AZ
  const azDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());

  const { data: openRecords, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("date", azDate)
    .in("status", ["checked_in", "paused"]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  let processed = 0;

  for (const rec of openRecords || []) {
    const pauses = Array.isArray(rec.pauses) ? [...(rec.pauses as any[])] : [];
    if (pauses.length > 0 && !pauses[pauses.length - 1].end) {
      pauses[pauses.length - 1].end = now.toISOString();
    }
    const checkIn = new Date(rec.check_in).getTime();
    let pausedMs = 0;
    for (const p of pauses) {
      const start = new Date(p.start).getTime();
      const end = p.end ? new Date(p.end).getTime() : now.getTime();
      pausedMs += end - start;
    }
    const workedMinutes = Math.max(0, (now.getTime() - checkIn - pausedMs) / 60000);

    await supabase.from("attendance_records").update({
      check_out: now.toISOString(),
      status: "checked_out",
      pauses,
      total_worked_minutes: workedMinutes,
    }).eq("id", rec.id);

    await supabase.from("activity_logs").insert({
      user_id: rec.user_id,
      action: "auto_checkout",
      details: `Auto checked out at 6:00 PM Arizona time. Worked ${workedMinutes.toFixed(1)} minutes`,
    });

    processed += 1;
  }

  return new Response(JSON.stringify({ processed, date: azDate }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

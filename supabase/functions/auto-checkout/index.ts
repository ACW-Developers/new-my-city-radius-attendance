import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Returns today's date string (YYYY-MM-DD) in America/Phoenix
const getAZToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = getAZToday();
    const now = new Date();

    // Find all records for today that are still open
    const { data: openRecords, error: fetchErr } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("date", today)
      .in("status", ["checked_in", "paused"]);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ user_id: string; worked_minutes: number }> = [];

    for (const record of openRecords ?? []) {
      const pauses = Array.isArray(record.pauses) ? [...(record.pauses as any[])] : [];
      // Close any open pause
      if (pauses.length > 0 && !pauses[pauses.length - 1].end) {
        pauses[pauses.length - 1].end = now.toISOString();
      }

      const checkInMs = record.check_in ? new Date(record.check_in).getTime() : now.getTime();
      let pausedMs = 0;
      for (const p of pauses) {
        const start = new Date(p.start).getTime();
        const end = p.end ? new Date(p.end).getTime() : now.getTime();
        pausedMs += end - start;
      }
      const workedMinutes = Math.max(0, (now.getTime() - checkInMs - pausedMs) / 60000);

      const { error: updErr } = await supabase
        .from("attendance_records")
        .update({
          check_out: now.toISOString(),
          status: "checked_out",
          pauses,
          total_worked_minutes: workedMinutes,
        })
        .eq("id", record.id);

      if (updErr) {
        console.error("Update error for record", record.id, updErr);
        continue;
      }

      await supabase.from("activity_logs").insert({
        user_id: record.user_id,
        action: "auto_check_out",
        details: `Auto checked out at 6:00 PM AZ. Worked ${workedMinutes.toFixed(1)} minutes`,
      });

      results.push({ user_id: record.user_id, worked_minutes: workedMinutes });
    }

    return new Response(
      JSON.stringify({ success: true, date: today, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Auto-checkout error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

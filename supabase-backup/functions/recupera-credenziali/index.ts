import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // client con il JWT di chi chiama, per verificare che sia admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Non autenticato' }), { status: 401, headers: corsHeaders });
    }
    if (userData.user.user_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo un admin può recuperare le credenziali' }), { status: 403, headers: corsHeaders });
    }

    const { libreria_id } = await req.json();
    if (!libreria_id) {
      return new Response(JSON.stringify({ error: 'libreria_id mancante' }), { status: 400, headers: corsHeaders });
    }

    // client con service role, per operare sull'utente target
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: lib, error: libErr } = await adminClient.from('librerie').select('*').eq('id', libreria_id).single();
    if (libErr || !lib) {
      return new Response(JSON.stringify({ error: 'Libreria non trovata' }), { status: 404, headers: corsHeaders });
    }
    if (!lib.auth_user_id) {
      return new Response(JSON.stringify({ error: 'Questa libreria non ha ancora un account Auth collegato' }), { status: 400, headers: corsHeaders });
    }

    const nuovaPassword = genPassword();
    const { error: updErr } = await adminClient.auth.admin.updateUserById(lib.auth_user_id, { password: nuovaPassword });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ email: lib.email, password: nuovaPassword }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

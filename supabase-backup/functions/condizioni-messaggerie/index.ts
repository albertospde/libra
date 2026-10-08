// ============================================================================
// condizioni-messaggerie / index.ts
// Supabase Edge Function: dato libreria_id (o cod_cliente per admin) + lista
// EAN, ritorna anagrafica cliente Messaggerie + sconto/condizione pagamento
// per titolo. Usa SOLO endpoint di lettura (SalesConditions e' la "simulazione
// d'ordine" nativa di Messaggerie: nessun ordine reale viene creato).
//
// Secrets richiesti (Supabase): MESSAGGERIE_USERNAME, MESSAGGERIE_PASSWORD
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const AUTH_HOST = "https://auth.messaggerielibri.it";
const PORTAL_HOST = "https://www.messaggerielibri.it";
const API_HOST = "https://api.messaggerielibri.it";

const CLIENT_ID = "ml-portal";
const REDIRECT_URI = `${PORTAL_HOST}/signin-oidc`;
const SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "return_request_api_scope",
  "title_api_scope",
  "order_api_scope",
  "outbound_api_scope",
  "vendor_outbound_api_scope",
  "inbound_api_scope",
].join(" ");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ----------------------------------------------------------------------------
class CookieJar {
  private cookies = new Map<string, string>();
  absorb(response: Response) {
    const setCookies = response.headers.getSetCookie?.() ??
      [response.headers.get("set-cookie")].filter(Boolean) as string[];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      this.cookies.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
    }
  }
  header(): string {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

// Decodifica le entita' HTML (necessario per ReturnUrl: senza questo, ad ogni
// hop del login la querystring OIDC si corrompe accumulando "&amp;amp;..."
// finche' il server non riesce piu' a interpretarla).
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function extractHiddenInput(html: string, name: string): string | null {
  const re1 = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
  const raw = html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
  return raw !== null ? decodeHtmlEntities(raw) : null;
}

function extractAutoSubmitForm(html: string): { action: string; fields: Record<string, string> } | null {
  const actionMatch = html.match(/<form[^>]*action=["']([^"']*)["']/i);
  if (!actionMatch) return null;
  const action = decodeHtmlEntities(actionMatch[1]);
  const fields: Record<string, string> = {};
  const inputRe = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    fields[m[1]] = decodeHtmlEntities(m[2]);
  }
  return { action, fields };
}

function buildAuthorizeReturnUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code id_token",
    scope: SCOPES,
    response_mode: "form_post",
  });
  return `/connect/authorize/callback?${params.toString()}`;
}

// Errore diagnostico: NON contiene mai username/password (solo markup della
// risposta del server, che non li fa mai eco).
class LoginStepError extends Error {
  constructor(message: string, public step: string, public htmlSnippet: string, public status: number) {
    super(message);
  }
}

async function loginToMessaggerie(): Promise<CookieJar> {
  const username = Deno.env.get("MESSAGGERIE_USERNAME");
  const password = Deno.env.get("MESSAGGERIE_PASSWORD");
  if (!username || !password) {
    throw new Error("MESSAGGERIE_USERNAME / MESSAGGERIE_PASSWORD non configurati");
  }

  const jar = new CookieJar();
  const returnUrl = buildAuthorizeReturnUrl();
  const loginPageUrl = `${AUTH_HOST}/Account/Login?ReturnUrl=${encodeURIComponent(returnUrl)}`;

  let res = await fetch(loginPageUrl, { redirect: "manual" });
  jar.absorb(res);
  let html = await res.text();

  const rvt1 = extractHiddenInput(html, "__RequestVerificationToken");
  const returnUrlHidden1 = extractHiddenInput(html, "ReturnUrl") ?? returnUrl;
  if (!rvt1) {
    throw new LoginStepError("Token anti-forgery (step 1) non trovato", "step1", html.slice(0, 4000), res.status);
  }

  res = await fetch(`${AUTH_HOST}/Account/Login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": jar.header() },
    body: new URLSearchParams({ Username: username, ReturnUrl: returnUrlHidden1, __RequestVerificationToken: rvt1 }),
  });
  jar.absorb(res);
  html = await res.text();

  const rvt2 = extractHiddenInput(html, "__RequestVerificationToken");
  const returnUrlHidden2 = extractHiddenInput(html, "ReturnUrl") ?? returnUrlHidden1;
  const hasPasswordField = /name=["']Password["']/i.test(html);
  if (!rvt2 || !hasPasswordField) {
    throw new LoginStepError(
      "Step 2 (password) non raggiunto: probabile username non riconosciuto",
      "step2",
      html.slice(0, 4000),
      res.status,
    );
  }

  res = await fetch(`${AUTH_HOST}/Account/Login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": jar.header() },
    body: new URLSearchParams({ Password: password, ReturnUrl: returnUrlHidden2, __RequestVerificationToken: rvt2 }),
  });
  jar.absorb(res);

  let location = res.headers.get("location");
  if (!location) {
    // Nessun redirect: se la pagina restituita e' di nuovo il form di login
    // (username visibile, niente campo password), la password e' stata
    // rifiutata dal server -- non e' un problema di parsing del nostro codice.
    html = await res.text();
    const backToUsernameStep = /name=["']Username["']/i.test(html) && !/name=["']Password["']/i.test(html);
    if (backToUsernameStep || res.status >= 400) {
      throw new LoginStepError(
        backToUsernameStep
          ? "Login rifiutato dal server dopo l'invio della password (credenziali non valide o account bloccato)"
          : `Login fallito dopo invio password: HTTP ${res.status}`,
        "step2-submit",
        html.slice(0, 4000),
        res.status,
      );
    }
  }

  let hops = 0;
  while (location && hops < 5) {
    const url = location.startsWith("http") ? location : new URL(location, AUTH_HOST).toString();
    res = await fetch(url, { method: "GET", redirect: "manual", headers: { "Cookie": jar.header() } });
    jar.absorb(res);
    location = res.headers.get("location");
    hops++;
  }

  if (!location) {
    html = await res.text();
    const autoForm = extractAutoSubmitForm(html);
    if (autoForm) {
      const submitUrl = autoForm.action.startsWith("http") ? autoForm.action : new URL(autoForm.action, AUTH_HOST).toString();
      res = await fetch(submitUrl, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": jar.header() },
        body: new URLSearchParams(autoForm.fields),
      });
      jar.absorb(res);
      const loc2 = res.headers.get("location");
      if (loc2) {
        const url2 = loc2.startsWith("http") ? loc2 : new URL(loc2, PORTAL_HOST).toString();
        res = await fetch(url2, { method: "GET", redirect: "manual", headers: { "Cookie": jar.header() } });
        jar.absorb(res);
      }
    }
  }

  return jar;
}

async function getScopedToken(jar: CookieJar, scope: string): Promise<string> {
  const res = await fetch(`${PORTAL_HOST}/umbraco/identity/token/GetToken?scope=${encodeURIComponent(scope)}`, {
    headers: { "Cookie": jar.header() },
  });
  if (!res.ok) throw new Error(`GetToken fallito per scope "${scope}": HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`GetToken non ha restituito access_token per scope "${scope}"`);
  return data.access_token as string;
}

async function getSalesConditions(jar: CookieJar, customerCode: string, eans: string[]) {
  const token = await getScopedToken(jar, "order_api_scope");
  const res = await fetch(`${API_HOST}/ordini/SalesConditions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customerCode: customerCode.padStart(10, "0"), documentType: "restock", eans }),
  });
  if (!res.ok) throw new Error(`SalesConditions fallito: HTTP ${res.status}`);
  return await res.json();
}

async function getCustomerDetails(jar: CookieJar, customerCode: string) {
  const res = await fetch(
    `${PORTAL_HOST}/Umbraco/Api/InserimentoOrdiniApi/GetCustomerDetails?customerCode=${customerCode.padStart(10, "0")}`,
    { headers: { "Cookie": jar.header() } },
  );
  if (!res.ok) throw new Error(`Anagrafica cliente fallita: HTTP ${res.status}`);
  return await res.json();
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), { status: 401, headers: corsHeaders });
    }
    const isAdmin = userData.user.user_metadata?.role === "admin";

    const body = await req.json();
    const { libreria_id, cod_cliente: rawCodCliente, eans, debug } = body as {
      libreria_id?: string;
      cod_cliente?: string;
      eans: string[];
      debug?: boolean;
    };

    if (!Array.isArray(eans) || eans.length === 0) {
      return new Response(JSON.stringify({ error: "eans mancante o vuoto" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    let codCliente: string;
    let libreriaInfo: Record<string, unknown> | null = null;

    if (libreria_id) {
      const { data: lib, error: libErr } = await adminClient
        .from("librerie")
        .select("id, ragione_sociale, cod_cliente, auth_user_id")
        .eq("id", libreria_id)
        .single();
      if (libErr || !lib) {
        return new Response(JSON.stringify({ error: "Libreria non trovata" }), { status: 404, headers: corsHeaders });
      }
      if (!isAdmin && lib.auth_user_id !== userData.user.id) {
        return new Response(JSON.stringify({ error: "Non autorizzato per questa libreria" }), { status: 403, headers: corsHeaders });
      }
      if (!lib.cod_cliente) {
        return new Response(JSON.stringify({ error: "Libreria senza cod_cliente Messaggerie" }), { status: 400, headers: corsHeaders });
      }
      codCliente = lib.cod_cliente;
      libreriaInfo = { id: lib.id, ragione_sociale: lib.ragione_sociale };
    } else if (isAdmin && rawCodCliente) {
      codCliente = rawCodCliente;
    } else {
      return new Response(JSON.stringify({ error: "libreria_id mancante (o cod_cliente, solo admin)" }), { status: 400, headers: corsHeaders });
    }

    let jar: CookieJar;
    try {
      jar = await loginToMessaggerie();
    } catch (e) {
      if (e instanceof LoginStepError) {
        const payload: Record<string, unknown> = { error: e.message, step: e.step, httpStatus: e.status };
        if (debug && isAdmin) payload.htmlSnippet = e.htmlSnippet;
        return new Response(JSON.stringify(payload), { status: 502, headers: corsHeaders });
      }
      throw e;
    }

    const [conditions, customer] = await Promise.all([
      getSalesConditions(jar, codCliente, eans),
      getCustomerDetails(jar, codCliente).catch(() => null),
    ]);

    return new Response(
      JSON.stringify({ libreria: libreriaInfo, cliente: customer, condizioni: conditions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

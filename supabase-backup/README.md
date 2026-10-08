# Backup Supabase — PDE Libra (progetto "ORDINI LIBRAI")

Istantanea dell'8 ottobre 2026 del progetto Supabase `pvsoijmopdqozvutgtdm`, fatta prima di dismettere il bucket `giro-pdf`.

| File | Contenuto |
|---|---|
| `schema.sql` | Tabelle, vincoli, indici, policy RLS, bucket e policy storage |
| `dati.json` | Tutti i dati: 1.020 titoli, 4 librerie, 1 giro, 1 campagna, 2 proposte, 6 ordini (45 righe), 3 chat (9 messaggi), 2 materiali, elenco utenti Auth (senza password) ed elenco dei 265 PDF che erano in `giro-pdf` |
| `functions/` | Sorgenti delle edge function `recupera-credenziali` (v4) e `condizioni-messaggerie` (v5) |

## Ricreare il progetto da zero

1. Nuovo progetto Supabase → SQL editor → esegui `schema.sql`.
2. Ricarica i dati da `dati.json` (ordine: giri, campagne, proposte, librerie, titoli, materiali_sezione, ordini, ordini_dettaglio, chat_conversazioni, chat_messaggi), poi `select setval('ordini_numero_ordine_seq', <ordini_seq>);`.
3. Ridistribuisci le due edge function e imposta i secret `MESSAGGERIE_USERNAME` / `MESSAGGERIE_PASSWORD` per `condizioni-messaggerie`.
4. Gli utenti Auth vanno ricreati (le password non sono esportabili): reinvito o "recupera credenziali" dal pannello admin.
5. Aggiorna URL e chiave publishable in `index.html`.

## Da sistemare prima del lancio ai librai

- **RLS troppo aperte**: quasi tutte le tabelle hanno `for all to authenticated using (true)`. Qualsiasi libraio loggato potrebbe leggere e modificare librerie, ordini e chat delle altre librerie. Vanno filtrate per `libreria_id` legato a `auth.uid()`.
- **Ruolo admin in `user_metadata`**: è modificabile dall'utente stesso. Va spostato in `app_metadata` (come già fatto in BookUp con `ou_is_admin()`), sia nelle policy sia nelle edge function.
- **Registrazione anon**: la policy `anon puo registrarsi` permette inserimenti liberi in `librerie`. Valuta un limite (stato forzato a `in_attesa`, niente `auth_user_id` arbitrario).

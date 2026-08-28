# GG.Chat

Een complete social-media webapp voor GitHub Pages + Supabase.

## Wat werkt

- Accountregistratie en login
- Publieke gebruikersprofielen
- Unieke gebruikersnamen
- Profielfoto, banner, bio, locatie en website aanpassen
- Officieel vinkje en aangepaste badge-labels
- Rollen: user, creator, moderator, admin
- Feed met berichten
- Afbeelding-URL bij berichten
- Likes
- Reacties
- Accounts zoeken
- Volgen / ontvolgen
- Volgers- en volgend-aantallen
- Accountsuggesties
- Realtime privéberichten
- Gesprekken starten met bestaande accounts
- Ongelezen DM-teller
- Meldingen voor volgen, likes, reacties en berichten
- Realtime feed- en notificatie-updates
- Responsive desktop- en mobiele UI
- RLS-beveiliging in Supabase
- Badgevelden zijn beschermd tegen zelf-toekennen vanuit de browser
- V2 auth-interface met extra validatie en wachtwoordsterkte
- Online/offline status
- Extra loading states, animaties en UI feedback
- Progressive enhancement via `v2.js` en `v2.css`

## Belangrijke fix: Supabase Project URL

`SUPABASE_URL` moet altijd alleen de project-base-URL zijn.

Goed:

```text
https://jouwproject.supabase.co
```

Fout:

```text
https://jouwproject.supabase.co/rest/v1/
https://jouwproject.supabase.co/auth/v1/
```

De Supabase JavaScript client voegt zelf `/rest/v1`, `/auth/v1` en andere API-routes toe. Als je `/rest/v1/` al in `config.js` zet, worden ongeldige Auth-URLs opgebouwd en kun je fouten krijgen zoals **Invalid path requested URL**.

## 1. Supabase maken

1. Maak een nieuw project op Supabase.
2. Open **SQL Editor**.
3. Kopieer de volledige inhoud van `supabase-schema.sql`.
4. Voer het script uit.
5. Ga daarna naar **Project Settings > API**.
6. Kopieer je Project URL en je publishable / anon key.

Gebruik **NOOIT** de `service_role` key in deze repository. Die key geeft beheerdersrechten en hoort alleen op een beveiligde server.

## 2. config.js instellen

Open `config.js` en gebruik alleen de project-base-URL:

```js
window.GG_CONFIG = {
  SUPABASE_URL: "https://jouw-project.supabase.co",
  SUPABASE_ANON_KEY: "jouw-anon-public-key"
};
```

In deze repo staat de configuratie inmiddels in V2-formaat met extra appgegevens en een GitHub Pages-veilige base/redirect URL.

De publishable/anon key mag in frontendcode staan. De beveiliging wordt door de Row Level Security policies in `supabase-schema.sql` afgedwongen.

## 3. Authentication instellen

Ga in Supabase naar **Authentication > URL Configuration**.

Voor deze repository zet je de Site URL op:

```text
https://cozynxis.github.io/GG.Chat/
```

Voeg bij **Redirect URLs** minimaal ook toe:

```text
https://cozynxis.github.io/GG.Chat/
https://cozynxis.github.io/GG.Chat/**
```

Gebruik daar geen `/rest/v1/` of `/auth/v1/` URL.

Als je een eigen domein gebruikt, voeg dat domein apart toe aan zowel de Site URL/redirect-configuratie als Redirect URLs.

Je kunt bij **Authentication > Providers > Email** bepalen of een nieuw account eerst zijn e-mailadres moet bevestigen.

## 4. GitHub Pages aanzetten

Ga in deze repository naar:

**Settings > Pages > Build and deployment**

Kies:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

Daarna wordt de website via GitHub Pages gepubliceerd.

## Als account maken nog niet werkt

Controleer deze punten in deze volgorde:

1. `config.js` gebruikt `https://...supabase.co` zonder `/rest/v1/`.
2. Het volledige `supabase-schema.sql` is zonder fouten uitgevoerd.
3. **Authentication > Providers > Email** is ingeschakeld.
4. **Authentication > URL Configuration** bevat de correcte GitHub Pages URL.
5. Je hebt na een wijziging aan GitHub Pages even de nieuwste deployment geopend/ververst.
6. Open DevTools > Console en Network om de exacte Supabase-fout te bekijken wanneer de registratie wordt afgewezen.

## Officieel vinkje geven

Een gebruiker kan zichzelf niet via de browser verifiëren. Gebruik als eigenaar Supabase SQL Editor:

```sql
update public.profiles
set verified = true,
    badge_label = 'Official',
    role = 'creator'
where username = 'gebruikersnaam';
```

Voor een moderator:

```sql
update public.profiles
set verified = true,
    badge_label = 'Moderator',
    role = 'moderator'
where username = 'gebruikersnaam';
```

## Belangrijk over account verwijderen

De huidige knop verwijdert het openbare `profiles` record, waarna gekoppelde social data via foreign keys wordt opgeschoond. Voor het verwijderen van het onderliggende Supabase Auth-account zelf is een beveiligde serverfunctie / Edge Function nodig, omdat je hiervoor geen `service_role` key in browsercode mag stoppen.

## Bestanden

- `index.html` — hoofdstructuur van de applicatie
- `style.css` — oorspronkelijke desktop/mobiele interface
- `v2.css` — V2 visual system, animaties, auth- en responsive verbeteringen
- `app.js` — auth, posts, likes, follows, profiles, search, DM's en meldingen
- `v2.js` — extra validatie, loading states, connection status, shortcuts en progressive enhancement
- `config.js` — Supabase public configuratie en appconfiguratie
- `supabase-schema.sql` — database, triggers, policies en realtime setup

## V2 UI

De V2-laag is expres opgesplitst. Daardoor blijft de bestaande functionele app bruikbaar, terwijl de interface en aanvullende clientlogica veel uitgebreider kunnen worden zonder alle code in één gigantisch bestand te stoppen.

V2 voegt onder andere toe:

- boot/loading screen
- uitgebreider login- en registratieontwerp
- realtime gebruikersnaamvalidatie in de interface
- wachtwoordsterkte-indicator
- verbeterde focus states
- verbeterde buttons en micro-animaties
- connection/offline banner
- V2 status indicators
- verbeterde composer counters
- uitgebreidere responsive styling
- reduced-motion ondersteuning
- browser error logging
- keyboard shortcuts
- automatische progressive enhancement voor dynamisch ingeladen onderdelen

## Volgende uitbreidingen

De huidige basis is geschikt om verder uit te bouwen met Supabase Storage uploads, groeps-DM's, reposts, bookmarks, hashtags, mentions, moderatie, rapportages, notificatie-instellingen, custom themes, admin dashboard, account bans, push notifications, stories en uitgebreidere discovery.

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

## 1. Supabase maken

1. Maak een nieuw project op Supabase.
2. Open **SQL Editor**.
3. Kopieer de volledige inhoud van `supabase-schema.sql`.
4. Voer het script uit.
5. Ga daarna naar **Project Settings > API**.
6. Kopieer je Project URL en je `anon` / public key.

Gebruik **NOOIT** de `service_role` key in deze repository. Die key geeft beheerdersrechten en hoort alleen op een beveiligde server.

## 2. config.js instellen

Open `config.js` en wijzig:

```js
window.GG_CONFIG = {
  SUPABASE_URL: "https://jouw-project.supabase.co",
  SUPABASE_ANON_KEY: "jouw-anon-public-key"
};
```

De anon key mag in een frontend staan. De beveiliging wordt door de Row Level Security policies in `supabase-schema.sql` afgedwongen.

## 3. Authentication instellen

Ga in Supabase naar **Authentication > URL Configuration**.

Voor GitHub Pages zet je de Site URL bijvoorbeeld op:

```text
https://cozynxis.github.io/GG.Chat/
```

Voeg dezelfde URL ook toe aan de Redirect URLs.

Je kunt bij **Authentication > Providers > Email** instellen of een gebruiker eerst zijn e-mail moet bevestigen.

## 4. GitHub Pages aanzetten

Ga in deze repository naar:

**Settings > Pages > Build and deployment**

Kies:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

Daarna wordt de website via GitHub Pages gepubliceerd.

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

- `index.html` — volledige applicatiestructuur
- `style.css` — desktop/mobiele interface en animaties
- `app.js` — auth, posts, likes, follows, profiles, search, DM's en meldingen
- `config.js` — Supabase public configuratie
- `supabase-schema.sql` — database, triggers, policies en realtime setup

## Volgende uitbreidingen

De huidige basis is geschikt om verder uit te bouwen met onder andere file uploads via Supabase Storage, groeps-DM's, reposts, bookmarks, hashtags, moderatie, rapportages, notificatie-instellingen, custom themes, admin dashboard en push notifications.

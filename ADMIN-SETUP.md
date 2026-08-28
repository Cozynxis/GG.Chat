# GG.Chat Admin Console setup

De Admin Console gebruikt **geen plaintext wachtwoord in GitHub**. Je normale account moet eerst via Supabase éénmalig als owner/admin worden ingesteld.

## 1. SQL installeren

Voer in **Supabase > SQL Editor** eerst volledig uit:

1. `admin-schema.sql`
2. `admin-security-patch.sql`

Beide scripts zijn bedoeld voor je bestaande GG.Chat database.

## 2. Jouw account als enige owner instellen

Log eerst één keer normaal in op GG.Chat zodat je profiel bestaat. Kies daarna je eigen GG.Chat-gebruikersnaam en een apart sterk admin-wachtwoord van minimaal 10 tekens.

Voer in SQL Editor uit:

```sql
select public.bootstrap_admin(
  'jouw_ggchat_gebruikersnaam',
  'jouw-aparte-sterke-admin-wachtwoord'
);
```

Voorbeeld:

```sql
select public.bootstrap_admin('levi','MijnSterkeAdminWachtwoord-2026!');
```

Gebruik in het echt een eigen wachtwoord. Zet dat wachtwoord **nergens in GitHub, config.js, JavaScript of issues**.

`bootstrap_admin` kan niet vanuit de website door normale gebruikers worden uitgevoerd. De functie is bewust niet beschikbaar voor `anon` en `authenticated` en is alleen bedoeld voor de Supabase SQL Editor als projecteigenaar.

## 3. Site opnieuw openen

Log uit GG.Chat en opnieuw in. Onder **Profiel** in de desktopzijbalk verschijnt dan alleen voor jouw owner-account:

**Admin Panel**

Na klikken krijg je een extra wachtwoordscherm. Na een correct wachtwoord maakt Supabase een tijdelijke adminsessie van maximaal **45 minuten**. Het ruwe sessietoken wordt alleen in `sessionStorage` van die browsertab bewaard.

## Wat het adminpanel kan

- Dashboard met gebruikers, posts, likes, reacties, follows, DM's, geverifieerde en geschorste accounts
- Accounts zoeken op naam of gebruikersnaam
- Profielrollen beheren
- Officieel vinkje geven/verwijderen
- Accounts schorsen en herstellen
- Schorsingsreden opslaan
- Privacy en DM-instellingen beheren
- Publieke volgers-, volgend- en like-statistieken overschrijven
- Statistiek-override weer verwijderen door het veld leeg te maken
- Profielbadges toekennen en verwijderen
- Systeemmeldingen naar een gebruiker sturen
- Badgecatalogus bekijken
- Adminsessie handmatig vergrendelen

## Badgecatalogus

Bij installatie worden onder andere deze badges toegevoegd:

- Official
- Admin
- Staff
- Moderator
- Developer
- Creator
- Partner
- Verified Org
- Premium
- OG
- Early Adopter
- Supporter
- Gamer
- Artist
- Music
- News
- Education
- Community

Badges worden naast de naam als kleine gekleurde iconen weergegeven. Op een profiel worden ze ook als uitgebreidere badge-pills getoond.

## Waarom dit owner-only is

De knop wordt niet alleen op `role='admin'` gebaseerd. `admin_ui_allowed()` controleert ook of voor het huidige Auth-account een private credential in `private.admin_credentials` bestaat. Daardoor krijgt iemand die per ongeluk een adminrol krijgt nog niet automatisch toegang tot jouw owner-console.

Daarnaast controleert iedere beheeractie opnieuw:

1. de normale Supabase Auth-gebruiker (`auth.uid()`),
2. of die gebruiker een echte admin is,
3. of een geldige tijdelijke admintoken wordt meegestuurd,
4. of die token niet verlopen of ingetrokken is.

De `service_role` key is nergens nodig in de frontend en hoort daar ook nooit te staan.

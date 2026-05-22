# Plan — AURUM SYSTEM : Comptes utilisateurs & personnalisation

La plupart des points (1 nettoyage IA, 4 structure admin, 5 édition manuelle, 6 multilingue, 7 PDF pro) sont **déjà implémentés** dans les itérations précédentes. Ce plan se concentre sur ce qui manque réellement : **authentification, isolation des données par utilisateur, et personnalisation intelligente**.

## 1. Authentification (Lovable Cloud)

- Activer email/password + Google (via le broker Lovable)
- Désactiver la confirmation email (UX terrain rapide) — *à confirmer*
- Pages : `/login`, `/register`, `/profile` (enrichir l'existant)
- Layout `_authenticated` qui protège toutes les routes app
- Listener `onAuthStateChange` au root pour invalider le cache

## 2. Table `profiles`

Migration Supabase :
- `id` (uuid, FK `auth.users` ON DELETE CASCADE)
- `full_name`, `email`, `country`, `profession`, `preferred_lang` (fr|en)
- RLS : chaque utilisateur ne lit/écrit que son profil
- Trigger `handle_new_user` : crée le profil à l'inscription avec les métadonnées du signup

## 3. Isolation des documents par utilisateur

Migration sur `documents` :
- Ajouter `user_id uuid NOT NULL` (FK `auth.users`)
- Remplacer les policies publiques par des policies `auth.uid() = user_id`
- *Note* : les documents existants sans user_id seront supprimés (aucun utilisateur jusqu'ici)

Adapter `aurum.functions.ts` :
- `saveDocument`, `updateDocument`, `listDocuments`, `getDocument` passent par `requireSupabaseAuth`
- Le `user_id` est injecté côté serveur depuis `context.userId`

## 4. Personnalisation IA selon profil

Étendre les prompts `generateDocument` et `cleanRawTranscript` :
- Recevoir `country`, `profession`, `lang` du profil utilisateur
- Règles de style :
  - Cameroun / pays francophones → style administratif FR (PV gendarmerie/police)
  - Anglophones → "incident report" format
  - ONG / humanitaire → "field report" style
  - Médical → rapport clinique synthétique
- Sélection automatique du template selon `profession`

## 5. UX

- Sélecteur de langue dans Register pré-rempli depuis navigator
- Profil affiche pays/métier/langue éditables
- Indicateur utilisateur dans le header (avatar + nom)
- Bouton "Déconnexion"

## Détails techniques

**Fichiers à créer :**
- `src/routes/login.tsx`, `src/routes/register.tsx`
- `src/routes/_authenticated.tsx` (layout guard)
- Déplacer routes app sous `_authenticated/` : `index.tsx`, `new.tsx`, `record.$type.tsx`, `document.$id.tsx`, `profile.tsx`, `settings.tsx`
- `src/hooks/use-auth.ts` (session + profil)
- `src/lib/profile.functions.ts` (server fn `getMyProfile`, `updateMyProfile`)

**Fichiers à modifier :**
- `src/routes/__root.tsx` : context auth + onAuthStateChange
- `src/router.tsx` : context auth
- `src/lib/aurum.functions.ts` : middleware auth + user_id + personnalisation
- `src/hooks/use-sync-engine.ts` : attacher user_id à la sync
- `src/lib/offline-store.ts` : stocker user_id dans la queue
- `src/components/SyncStatus.tsx` : ajouter avatar + logout
- `src/i18n/fr.json` / `en.json` : clés auth

**Migrations :**
1. Créer `profiles` + trigger `handle_new_user` + RLS
2. Ajouter `user_id` à `documents` + remplacer policies + supprimer rows orphelines

**Auth config :** email/password + Google via `supabase--configure_social_auth`.

## Hors scope (déjà fait)

- ✅ Nettoyage IA après transcription (`cleanRawTranscript`)
- ✅ Structure administrative des rapports (intro/faits/déclarations/observations/conclusion)
- ✅ Édition manuelle avant PDF
- ✅ Multilingue FR/EN
- ✅ PDF pro avec logo et mise en page
- ✅ Design GovTech mobile-first

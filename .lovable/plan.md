# AURUM — Mode offline-first

## Constat sur l'existant

L'app utilise aujourd'hui la **Web Speech API** pour la transcription en direct. Cette API **exige une connexion internet** (elle envoie l'audio aux serveurs de Google). Elle est donc **incompatible** avec un mode terrain hors-ligne.

Pour vraiment fonctionner offline, il faut :
1. Capturer l'**audio brut** sur l'appareil (`MediaRecorder`), pas la transcription.
2. Le stocker localement (**IndexedDB**).
3. Le transcrire côté **serveur** quand la connexion revient (Gemini multimodal via Lovable AI Gateway accepte l'audio).

## Plan d'implémentation

### 1. Stockage local (IndexedDB)
- Nouvelle lib `src/lib/offline-store.ts` basée sur `idb` :
  - Store `audios` : `{ id, blob, mimeType, durationMs, createdAt }`
  - Store `queue` : `{ id, type: "rapport"|"pv", audioId?, transcript?, status: "pending"|"uploading"|"transcribing"|"generating"|"synced"|"error", remoteDocId?, errorMsg?, createdAt }`

### 2. Capture audio (remplace Web Speech)
- Refonte de `src/routes/record.$type.tsx` :
  - `MediaRecorder` (audio/webm;codecs=opus, fallback mp4 iOS)
  - Indicateur de niveau sonore + minuteur
  - À l'arrêt : sauvegarde du blob en IndexedDB + création d'une entrée queue `pending`
  - Redirection vers le tableau de bord
- Garde la saisie manuelle (texte direct → queue `pending` sans audio).

### 3. Transcription serveur
- Nouvelle server fn `transcribeAudio` (`src/lib/aurum.functions.ts`) :
  - Reçoit `{ audioBase64, mimeType }`
  - Appelle Gemini 2.5 Flash via gateway en mode multimodal (audio inline)
  - Renvoie `{ transcript }`
- `generateDocument` reste tel quel (déjà câblé avec nettoyage automatique).

### 4. Moteur de synchronisation
- Nouveau hook `src/hooks/use-sync-engine.ts` monté dans `__root.tsx` :
  - Écoute `online`/`offline` + ping périodique (toutes les 30 s)
  - Quand online + items `pending` : traite séquentiellement
    - `uploading` → `transcribing` (si audio) → `generating` → insert Supabase → `synced`
    - Sur erreur : `status: "error"` + message ; retry manuel possible
- Toast discret à chaque doc synchronisé.

### 5. UI
- **Badge online/offline** dans le header de `__root.tsx` (point vert/gris + label).
- **Bannière** sur la home quand offline : « Mode hors ligne activé — vos données seront synchronisées automatiquement ».
- Nouvelle section sur `index.tsx` : **« Documents en attente »** au-dessus de l'historique, listant les items de la queue avec leur statut (badge coloré), bouton « Réessayer » si `error`, bouton « Supprimer ».
- Les documents `synced` apparaissent dans l'historique habituel (table Supabase).

### 6. App shell offline (léger, sans PWA complète)
- Pas de service worker custom (risque de cache obsolète dans le preview Lovable — voir docs PWA).
- Le navigateur cache déjà l'app après une première visite ; suffisant pour le MVP terrain.
- Manifest minimal `public/manifest.json` + `<link rel="manifest">` pour « Ajouter à l'écran d'accueil » sur mobile (installable, pas de SW).

## Détails techniques

- Dépendance ajoutée : `idb` (~1 KB, wrapper IndexedDB).
- Modèle Gemini pour transcription : `google/gemini-2.5-flash` (audio inline, FR).
- Limite audio : avertir l'utilisateur au-delà de ~10 min (gros base64) ; pour le MVP on garde simple.
- Pas de changement de schéma Supabase nécessaire — la queue vit uniquement côté client jusqu'à la sync.
- `navigator.onLine` est complété par un fetch `HEAD` léger vers `/` car `onLine` ment souvent (renvoie `true` sur captive portal).

## Hors scope (pour rester simple)

- Pas de PWA complète avec service worker / cache offline des assets (risques décrits dans les guidelines).
- Pas de chiffrement local des audios.
- Pas de gestion multi-onglets (un seul onglet sync à la fois — verrou simple via `BroadcastChannel` si besoin plus tard).
- Pas de compression audio côté client.

## Fichiers touchés

- créés : `src/lib/offline-store.ts`, `src/hooks/use-sync-engine.ts`, `src/components/SyncStatus.tsx`, `src/components/PendingQueue.tsx`, `public/manifest.json`
- modifiés : `src/lib/aurum.functions.ts` (+ `transcribeAudio`), `src/routes/record.$type.tsx` (refonte capture), `src/routes/index.tsx` (section file d'attente), `src/routes/__root.tsx` (badge + manifest), `package.json` (idb)

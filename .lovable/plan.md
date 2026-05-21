## Plan — Évolution AURUM SYSTEM

Mise à jour majeure couvrant 7 axes. Implémentation en frontend + ajustements DB + génération PDF/IA.

---

### 1. Support multilingue (FR / EN)

- Installer `i18next` + `react-i18next` (léger, SSR-safe).
- Créer `src/i18n/index.ts` + dictionnaires `src/i18n/fr.json` et `src/i18n/en.json` couvrant tous les écrans (accueil, enregistrement, document, profil, paramètres, à propos, file d'attente, statuts).
- Stockage de la langue : `localStorage` clé `aurum.lang` (défaut: FR, fallback navigateur).
- Hook `useLang()` exposant `lang`, `setLang`, `t`.
- Sélecteur `LanguageSwitcher` (FR / EN, drapeaux) intégré :
  - Header de l'écran d'accueil (`index.tsx`)
  - Écran Paramètres
- Les prompts IA (`generateDocument`, `cleanRawTranscript`) reçoivent `lang` en input et adaptent la langue de sortie (titres de sections, ton administratif).
- Le PDF utilise les libellés traduits selon la langue du document.

### 2. Écran "À propos"

- Nouvelle route `src/routes/about.tsx`.
- Carte institutionnelle GovTech : logo or, titre AURUM SYSTEM, description bilingue.
- Bloc infos :
  - CEO : NYETAM MALONG MAURICE EMMANUEL
  - Pays : Cameroun 🇨🇲
  - WhatsApp : `wa.me/237695599387` (lien cliquable)
  - LinkedIn : AURUM SYSTEM (lien externe)
- Lien depuis l'accueil + paramètres.

### 3. Enrichissement des PV / Rapports

Nouveaux champs sur `documents` (migration Supabase) :

| Champ | Type |
|---|---|
| `doc_date` | date |
| `doc_time` | time |
| `agent_name` | text |
| `location` | text |
| `reference` | text (auto: `AURUM-{YYYYMMDD}-{6 chars}`) |
| `observations` | text |
| `signature_name` | text |
| `lang` | text ('fr' \| 'en'), défaut 'fr' |

Le prompt IA est mis à jour pour produire : Contexte, Faits constatés, Déclarations recueillies, Observations, Conclusion — style administratif synthétique, non narratif, listes à puces quand pertinent.

### 4. Édition manuelle avant export

- Nouvelle route `src/routes/document.$id.edit.tsx` (ou onglet "Éditer" dans `document.$id.tsx`).
- Formulaire éditable : date, heure, agent, lieu, référence, observations, conclusion, contenu (faits, déclarations, introduction) + signature.
- Sauvegarde via server function `updateDocument`.
- Bouton "Modifier" visible depuis l'aperçu document.

### 5. Structure professionnelle

Template uniforme PV / Rapport :

```
EN-TÊTE OFFICIEL (logo + AURUM SYSTEM + Référence)
INFORMATIONS GÉNÉRALES (Date, Heure, Agent, Lieu, Type)
CONTEXTE
FAITS CONSTATÉS
DÉCLARATIONS RECUEILLIES
OBSERVATIONS
CONCLUSION
SIGNATURE (nom + espace signature)
```

Appliqué à la fois dans l'aperçu UI et dans le PDF.

### 6. PDF professionnel

Refonte `src/lib/pdf.ts` avec `jspdf` (déjà présent) :
- En-tête doré avec logo AURUM SYSTEM (SVG/PNG généré).
- Titres de section en majuscules, séparateurs.
- Bloc infos générales en tableau 2 colonnes.
- Pied de page : référence + pagination + "AURUM SYSTEM — Cameroun".
- Cadre signature en bas.
- Polices lisibles, marges généreuses (impression A4 + mobile).
- Libellés selon `doc.lang`.

### 7. Interface utilisateur

- **Profil utilisateur** : route `src/routes/profile.tsx` — nom de l'agent, fonction, signature par défaut (stocké en `localStorage`, clé `aurum.profile`, pré-rempli dans tout nouveau document).
- **Historique** : section enrichie dans `index.tsx` (filtres date/type, recherche).
- **Paramètres** : route `src/routes/settings.tsx` — langue, thème, profil rapide, lien À propos.
- **Mode clair/sombre** : toggle dans paramètres (`localStorage` `aurum.theme`, classe `dark` / `light` sur `<html>`). Tokens `src/styles.css` déjà en oklch — ajout d'un set "light" minimal sous `:root.light`.
- Navigation bas/haut conservée : mobile-first, simple, rapide terrain.

---

### Fichiers

**Créés**
- `src/i18n/index.ts`, `src/i18n/fr.json`, `src/i18n/en.json`
- `src/components/LanguageSwitcher.tsx`
- `src/components/ThemeToggle.tsx`
- `src/routes/about.tsx`
- `src/routes/profile.tsx`
- `src/routes/settings.tsx`
- `src/routes/document.$id.edit.tsx`
- `src/lib/profile-store.ts` (localStorage profil + préférences)

**Modifiés**
- `src/lib/aurum.functions.ts` — prompts bilingues, nouveaux champs, `updateDocument`
- `src/lib/pdf.ts` — refonte mise en page pro
- `src/lib/offline-store.ts` — propager les métadonnées
- `src/routes/__root.tsx` — provider i18n + thème
- `src/routes/index.tsx` — sélecteur langue, liens profil/paramètres/à propos, historique enrichi
- `src/routes/record.$type.tsx` — capture des métadonnées (lieu, agent) avant enregistrement
- `src/routes/document.$id.tsx` — affichage structure pro + bouton éditer
- `src/routes/new.tsx` — formulaire enrichi
- `src/styles.css` — tokens thème clair
- `package.json` — `i18next`, `react-i18next`

**Migration Supabase**
- ALTER TABLE `documents` ADD COLUMN `doc_date`, `doc_time`, `agent_name`, `location`, `reference`, `observations`, `signature_name`, `lang`.

---

### Notes

- Pas d'authentification ajoutée — le "profil" est local (localStorage). Si vous souhaitez un vrai compte multi-appareils, dites-le et j'ajouterai l'auth Lovable Cloud.
- Le sélecteur de langue agit immédiatement sur l'UI ; pour les anciens documents, la langue stockée est respectée à l'export.
- Mode sombre conservé par défaut (cohérent avec l'identité actuelle), clair en option.

# Déployer ConstructPro sur Hostinger

L'application est une app **Next.js (Node.js)**. Sur Hostinger, il faut donc un
**VPS** — l'hébergement Web / mutualisé (PHP) ne convient pas.

Supabase reste hébergé dans le cloud — rien ne change de ce côté.

Deux méthodes :
- **A. Coolify (recommandé)** — interface web façon Vercel, déploie depuis GitHub, gère le HTTPS.
- **B. Docker manuel** — identique au guide `DEPLOY-OVH.md`.

---

## Méthode A — VPS Hostinger + Coolify (recommandé)

### 1. Commander le VPS
- Hostinger → **VPS** → un plan KVM 1 ou KVM 2 suffit pour démarrer.
- Système d'exploitation / template : choisir **Coolify** (Hostinger l'installe automatiquement).
- À la fin, vous recevez l'**IP du serveur**.

### 2. Ouvrir Coolify
- Rendez-vous sur `http://VOTRE_IP_SERVEUR:8000`
- Créez le compte administrateur (première connexion).

### 3. Connecter GitHub
- Dans Coolify : **Sources → + Add → GitHub**
- Autorisez l'accès au dépôt `adelaire-blip/construction-pro`.

### 4. Créer le projet
- **+ New → Application → Public/Private Repository**
- Sélectionnez `construction-pro`, branche `main`.
- Build Pack : **Dockerfile** (le `Dockerfile` du repo est détecté automatiquement).
  - *Alternative : "Nixpacks" fonctionne aussi sans Dockerfile.*

### 5. Variables d'environnement
Dans l'onglet **Environment Variables**, ajoutez (vos clés Supabase) :

```
NEXT_PUBLIC_SUPABASE_URL=https://zreqbxdfyssfiiuwbavo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...       (service role key)
```

> Important : cochez **"Build Variable"** pour les deux `NEXT_PUBLIC_*`
> (elles sont nécessaires au moment du build, pas seulement à l'exécution).

### 6. Domaine + HTTPS
- Dans **Domains**, renseignez votre domaine (ex : `https://app.votredomaine.fr`).
- Dans la zone DNS de votre domaine, créez un enregistrement **A** :
  `app.votredomaine.fr → VOTRE_IP_SERVEUR`
- Coolify génère automatiquement le certificat HTTPS (Let's Encrypt).

### 7. Déployer
- Cliquez **Deploy**. Coolify build l'image et lance l'app.
- À chaque `git push` sur `main`, activez **"Automatic Deployment"** pour
  redéployer automatiquement (comme Vercel).

---

## Méthode B — Docker manuel

Si vous ne voulez pas de Coolify, suivez le guide `DEPLOY-OVH.md` : il s'applique
tel quel à un VPS Hostinger (seules l'IP et la connexion SSH changent).

```bash
ssh root@VOTRE_IP_SERVEUR
curl -fsSL https://get.docker.com | sh
git clone https://github.com/adelaire-blip/construction-pro.git
cd construction-pro
nano .env            # coller les 3 clés Supabase
docker compose up -d --build
```

App disponible sur `http://VOTRE_IP_SERVEUR:3000`.

---

## Mettre à jour Supabase

Dans **Supabase → Authentication → URL Configuration**, ajoutez votre nouvelle URL :
- Site URL : `https://app.votredomaine.fr`
- Redirect URLs : `https://app.votredomaine.fr/**`

---

## Résumé

| Élément          | Où                                    |
|------------------|----------------------------------------|
| App Next.js      | VPS Hostinger (Coolify ou Docker)      |
| HTTPS / domaine  | Géré par Coolify (ou Nginx en manuel)  |
| Base de données  | Supabase cloud (inchangé)              |

Vous pouvez garder **Vercel, OVH et/ou Hostinger** en parallèle — tous pointent
vers la même base Supabase.

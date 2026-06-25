# Déployer ConstructPro sur un VPS OVH

L'application est une app **Next.js (Node.js)**. Elle nécessite un **VPS OVH** ou un
serveur dédié (pas l'hébergement mutualisé OVH qui ne gère que PHP).

Supabase reste hébergé dans le cloud — rien ne change de ce côté.

---

## 1. Commander le VPS

- OVH → **VPS** → un modèle "VPS Value" suffit pour démarrer (~6-8 €/mois).
- Système : **Ubuntu 24.04 LTS**.
- À la fin, OVH vous envoie l'**IP du serveur** et un accès SSH (root).

## 2. Première connexion

```bash
ssh ubuntu@VOTRE_IP_SERVEUR   # ou root@VOTRE_IP selon la config OVH
```

## 3. Installer Docker

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# se déconnecter / reconnecter pour appliquer le groupe
exit
```

Reconnectez-vous en SSH.

## 4. Récupérer le code

```bash
sudo apt install -y git
git clone https://github.com/adelaire-blip/construction-pro.git
cd construction-pro
```

## 5. Créer le fichier d'environnement

```bash
nano .env
```

Collez (avec VOS clés Supabase) :

```
NEXT_PUBLIC_SUPABASE_URL=https://zreqbxdfyssfiiuwbavo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (votre anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...       (votre service role key)
```

`Ctrl+O` puis `Entrée` pour sauver, `Ctrl+X` pour quitter.

## 6. Lancer l'application

```bash
docker compose up -d --build
```

L'app tourne sur le port 3000. Testez : `http://VOTRE_IP_SERVEUR:3000`

Pour mettre à jour plus tard après un `git push` :

```bash
git pull
docker compose up -d --build
```

---

## 7. (Recommandé) Nom de domaine + HTTPS avec Nginx

### a. Pointer le domaine
Dans la zone DNS de votre domaine, créez un enregistrement **A** :
`app.votredomaine.fr  →  VOTRE_IP_SERVEUR`

### b. Installer Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### c. Configurer le reverse proxy

```bash
sudo nano /etc/nginx/sites-available/constructpro
```

Collez (remplacez le domaine) :

```nginx
server {
    server_name app.votredomaine.fr;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/constructpro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### d. Activer le HTTPS (gratuit, Let's Encrypt)

```bash
sudo certbot --nginx -d app.votredomaine.fr
```

Le certificat se renouvelle automatiquement.

### e. Pare-feu

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 8. Mettre à jour Supabase

Dans **Supabase → Authentication → URL Configuration**, ajoutez votre nouvelle URL :
- Site URL : `https://app.votredomaine.fr`
- Redirect URLs : `https://app.votredomaine.fr/**`

---

## Résumé

| Élément        | Où                              |
|----------------|----------------------------------|
| App Next.js    | VPS OVH (Docker, port 3000)      |
| HTTPS / domaine| Nginx + Certbot sur le VPS       |
| Base de données| Supabase cloud (inchangé)        |

Vous pouvez garder **Vercel ET OVH** en parallèle — les deux pointent vers la même
base Supabase.

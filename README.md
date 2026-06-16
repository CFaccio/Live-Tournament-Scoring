# Padel Tournament App v2

A full multi-user padel tournament platform with accounts, live scoring, score approval, and real-time leaderboards.

## Features
- Google + email/password authentication
- Create tournaments (6–24 players, flexible format)
- Invite players via link or 6-character code
- Seeded pair generation (top/bottom half split)
- Round-robin league + knockout bracket
- Score entry by match participants only
- Opponent approval required (auto-approves after 24h)
- Live leaderboard: points, W/D/L, games ratio, bonus points
- Works across all devices in real time
- Dark mode, PWA (installable on phone)

---

## Deploy to GitHub Pages

### Step 1 — Enable GitHub Pages for ES Modules
GitHub Pages serves static files, which works with ES modules (type="module") out of the box.

1. Go to github.com → New repository → name it `padel-tournament` → Public → Create
2. Click **uploading an existing file**
3. Upload ALL files preserving the folder structure:
   - `index.html`
   - `manifest.json`
   - `firestore.rules`
   - `css/style.css`
   - `js/app.js`
   - `js/auth.js`
   - `js/firebase.js`
   - `js/tournament.js`
   - `js/tournament-view.js`
   - `js/dashboard.js`
   - `js/create.js`
   - `icons/icon-192.png`
   - `icons/icon-512.png`
4. Commit changes
5. Settings → Pages → Branch: main → / (root) → Save

Your app will be live at: `https://YOUR-USERNAME.github.io/padel-tournament`

### Step 2 — Add your domain to Firebase Auth
1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Add: `YOUR-USERNAME.github.io`
This allows Google login to work from your domain.

### Step 3 — Update Firestore security rules
1. Go to Firebase Console → Firestore Database → Rules
2. Replace the existing rules with the contents of `firestore.rules`
3. Click Publish

---

## How it works

### For the organiser:
1. Sign in / create account
2. Create tournament → set name + player count
3. Share the invite link with players
4. Once enough players join, tap "Generate draw & start"
5. Players get their match schedule

### For players:
1. Click the invite link → sign in / create account
2. You're added to the tournament automatically
3. After your match, submit the score
4. Your opponent approves (or it auto-approves after 24h)
5. Leaderboard updates instantly

### Score validation:
- Either player in a match can submit the score
- The opposing pair must approve
- If not approved within 24 hours, it auto-approves
- Disputed scores are flagged for the organiser

---

## Future integrations
- Playtomic (padel ratings sync)
- Handicap Network Africa (golf handicaps)
- Push notifications
- Tournament history
- Multiple sports (golf, bowls)

# SquadFit Android app

Wraps https://squadfitgirlies.netlify.app in an Android app so it can read daily steps from **Health Connect**
(the same data Samsung Health and Google Fit use), even when the phone was in a bag or the screen was off.

- The app loads the live website, so web updates on Netlify show up without reinstalling.
- Every push to `main` builds a new APK on GitHub Actions and publishes it under **Releases**.
- Download link for the newest version: `https://github.com/<owner>/<repo>/releases/latest/download/SquadFit.apk`

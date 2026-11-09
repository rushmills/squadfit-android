# SquadFit setup guide (about 15 minutes)

You'll do 3 things: create the database, connect the app to it, put the app online.

## 0. Test on your phone first (optional, 2 minutes)

Before setting up the database, drag the **squadfit** folder onto **app.netlify.com/drop** as it is. With `config.js` left empty, the app runs in **demo mode**: data stays on that one phone, but everything works, including live GPS and step counting (which the Claude preview window can't do). Open the link on your phone and try a walk.

When you're happy, do steps 1 to 3 and re-upload the folder to the same Netlify site.

## 1. Create the database (Supabase, free)

1. Go to **supabase.com** and sign up (free plan).
2. Click **New project**. Name it `squadfit`, set a database password (save it somewhere), pick the region closest to Jamaica (**East US**). Click **Create**. Wait about 2 minutes.
3. In Supabase, go to **SQL Editor** (left menu) > **New query**. Paste the whole of `supabase-setup.sql` and click **Run**. You should see "Success".
4. Go to **Authentication** > **Sign In / Providers** > **Email**. Turn **OFF** "Confirm email". Click **Save**.
   (The app uses names and PINs, not real emails, so this must be off.)

## 2. Connect the app

1. In Supabase, go to **Project Settings** > **API** (or **Data API**).
2. Copy the **Project URL** and the **anon public** key. (Newer projects call it the **Publishable key**, starting with `sb_publishable_`. Either works. Never use the secret / service_role key.)
3. Open `config.js` in this folder with any text editor (Notepad, TextEdit) and paste them in:

```js
window.SQUADFIT_CONFIG = {
  appName: "SquadFit",
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...long key..."
};
```

You can also change `appName` to whatever you want to call the app. Save the file.

The anon key is safe to put in the app. The database rules decide who can see what.

## 3. Put it online (Netlify Drop, free)

1. Go to **app.netlify.com/drop** and sign up (free).
2. Drag the whole **squadfit** folder onto the page.
3. You'll get a link like `https://something.netlify.app`. Rename it under **Site configuration** > **Change site name** (e.g. `squadfit-ja`).

To update the app later, open the site in Netlify > **Deploys** > drag the folder in again.

## Your pictures

- **Background (splash + login):** `assets/squad-bg.jpg`.
- **Personal pictures:** `assets/jill.jpg`, `rush.jpg`, `toni.jpg`, `tiffy.jpg`. Each one is matched to the name used when joining, so everyone must join as **Jill**, **Rush**, **Toni** or **Tiffy** (capitals don't matter). It shows on that person's home screen banner, her round icon and her login tile.
- To swap a picture, replace the file with the same name and re-upload the folder to Netlify. To add someone new, add a line under `memberPictures` in `config.js`.

## 4. Share it

Send this in the WhatsApp group:

> Join SquadFit 💪 [your link]
> Tap "Join the squad", enter your name and pick a 4-digit PIN.
> Tip: add it to your home screen. iPhone: open in Safari > Share > Add to Home Screen. Android: open in Chrome > ⋮ > Add to Home screen.

There's no join code, so keep the link in the group. Once 4 people have joined, the squad is full and no one else can sign up. The app allows 4 members max (change `max_members` in Supabase > Table Editor > app_settings if you ever want more).

## Good to know

- **Privacy:** height, weight, age, gender and goal weight are locked at the database level. Only the owner's login can read them. Friends only see the goal as a %.
- **Live tracking:** the app must stay open with the screen on. iPhone asks for Motion permission the first time you tap Start. Allow it, and allow Location.
- **All-day steps:** browsers can't read Apple Health / Google Fit. Use **Log > Walk/Run > Enter manually** to add your daily step total.
- **Logging in:** tap your picture, then enter your PIN.
- **Home screen app:** on iPhone, the home-screen version keeps its own login, separate from Safari. Log in once inside it and it remembers you.
- **Change PIN:** Me tab > Change PIN.
- **Mistakes:** entries can't be edited yet. Delete with the × and add it again. Two people can have the same PIN. Names must be different (add a last initial if two of you share a name).
- **Forgot PIN:** in Supabase, go to Authentication > Users, delete that user, then delete their row in Table Editor > profiles. They can re-join (their old logs will be removed).


## Exact step counts from your iPhone (Apple Health)

The app can't read Apple Health directly, but an iPhone Shortcut can send today's total to it:

1. Open the **Shortcuts** app, tap **+** to make a new shortcut, and name it **SquadFit Steps**.
2. Add the action **Find Health Samples**. Set it to: Type **is Steps**, Start Date **is Today**.
3. Add **Calculate Statistics**. Set it to **Sum** of Health Samples.
4. Add **URL** and type `https://squadfitgirlies.netlify.app/?phonesteps=`, then tap the variable button and add **Statistics Result** at the end.
5. Add **Open URLs**.
6. Run it once and allow Health access when asked.

To make it automatic: Shortcuts > **Automation** > **+** > **Time of Day** (for example 9:00 PM, Daily) > **Run Immediately** > choose **SquadFit Steps**.

Shortcuts opens the link in Safari, so log in to SquadFit in Safari once as well. Each run replaces that day's phone total. It never adds to it, and it never doubles up with walks tracked in the app.

Android: copy the total from Google Fit or Samsung Health using Log > Walk/Run > Enter manually.

// Fill these in after creating your free Supabase project (see SETUP-GUIDE).
// Leave them empty to run the app in DEMO mode (data saved only on this phone).
window.SQUADFIT_CONFIG = {
  appName: "SquadFit",
  supabaseUrl: "https://gjsvlnzvltswwewtpoas.supabase.co",
  supabaseAnonKey: "sb_publishable_13jR5sqti9L5aNasPuWQkw_sDgL-fAU",

  // Splash, login and join screen background
  backgroundImage: "assets/squad-bg.jpg",

  // Daily step goal shown in the home screen ring
  stepGoal: 10000,

  // Download link for the Android app (filled in once it is built)
  androidAppUrl: "",

  // Squad admin (can reset PINs)
  adminName: "Rush",

  // Names shown in the Register drop-down
  squadNames: ["Jill", "Rush", "Toni", "Tiffy"],

  // Each person's own picture, matched to the name they join with
  // (capitals and spaces don't matter). Shown on their home screen and the login screen.
  memberPictures: {
    jill: "assets/jill.jpg",
    rush: "assets/rush.jpg",
    toni: "assets/toni.jpg",
    tiffy: "assets/tiffy.jpg"
  }
};

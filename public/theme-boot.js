// Puts the saved theme on the page before the stylesheet and the app load, so the first paint is already the
// right theme (no flash of Crested gecko for Light users). A plain same-origin file: the CSP allows no inline script.
// The app keeps the copy it reads up to date (localStorage "zoochattr.theme"); see rememberThemeForBoot in themes.ts.
(function () {
  var KNOWN = [
    "crested", "dark", "light", "eyecomfort", "eyecomfort-light", "penguin", "turtle", "elephant",
    "deuteranopia", "protanopia", "tritanopia", "highcontrast",
  ];
  var LIGHT = ["light", "eyecomfort-light"];
  var pick = function (value, fallback) {
    return KNOWN.indexOf(value) >= 0 ? value : fallback;
  };
  var skin = "crested";
  try {
    var saved = JSON.parse(localStorage.getItem("zoochattr.theme") || "null") || {};
    if (saved.skin === "auto") {
      var dark = window.matchMedia("(prefers-color-scheme: dark)").matches ||
        !window.matchMedia("(prefers-color-scheme: light)").matches;
      skin = dark ? pick(saved.dark, "crested") : pick(saved.light, "light");
    } else {
      skin = pick(saved.skin, "crested");
    }
  } catch (e) {
    // Storage blocked or junk: keep the default.
  }
  var light = LIGHT.indexOf(skin) >= 0;
  var root = document.documentElement;
  root.setAttribute("data-skin", skin);
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", light ? "light" : "dark");
})();

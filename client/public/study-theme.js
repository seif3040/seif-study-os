(() => {
  const modes = {"violet":"light","mint":"light","peach":"light","midnight":"dark","graphite":"dark"};
  const key = "seif-study-theme";
  function read(fallback = "violet") {
    try {
      const value = localStorage.getItem(key);
      if (Object.hasOwn(modes, value)) return value;
      if (localStorage.getItem("theme") === "dark") return "midnight";
    } catch { /* Storage is optional. */ }
    return fallback;
  }
  function apply(theme) {
    if (!Object.hasOwn(modes, theme)) return;
    const root = document.documentElement;
    root.dataset.studyTheme = theme;
    root.classList.toggle("dark", modes[theme] === "dark");
  }
  apply(read());
  window.addEventListener("storage", event => {
    if (event.key === key) apply(read());
  });
})();

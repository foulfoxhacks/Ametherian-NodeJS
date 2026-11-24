/* Progressive enhancement for copying machine-readable resource URLs. */
(() => {
  "use strict";
  document.querySelectorAll("[data-copy-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.getAttribute("data-copy-url");
      if (!value || !navigator.clipboard?.writeText) {
        button.textContent = "Copy unavailable";
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy unavailable";
      }
    });
  });
})();

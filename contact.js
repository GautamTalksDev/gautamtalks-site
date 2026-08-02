/* Copy-to-clipboard for the contact address. No inline handlers (CSP safe). */
(() => {
  "use strict";
  const btn = document.getElementById("copyMail");
  const out = document.getElementById("copied");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const mail = btn.dataset.mail;
    try {
      await navigator.clipboard.writeText(mail);
      out.textContent = "✓ COPIED · " + mail.toUpperCase();
    } catch {
      // clipboard blocked (older browser / insecure context): select it instead
      const r = document.createRange();
      const el = document.querySelector(".mc-mail");
      r.selectNodeContents(el);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      out.textContent = "SELECT AND COPY THE ADDRESS ABOVE";
    }
    setTimeout(() => { out.textContent = ""; }, 4000);
  });
})();
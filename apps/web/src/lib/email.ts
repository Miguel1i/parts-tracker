import "server-only";
import { Resend } from "resend";

let client: Resend | undefined;

/**
 * Sends a transactional email through Resend. Without RESEND_API_KEY (local dev) it logs the
 * message to the server console instead, so magic links still work.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.info(`[email] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return;
  }
  client ??= new Resend(key);
  const from = process.env.EMAIL_FROM || "Parts Tracker <onboarding@resend.dev>";
  const { error } = await client.emails.send({ from, to, subject, html, text });
  if (error) throw new Error(`Email not sent: ${error.message}`);
}

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** A minimal single-button email. */
export function linkEmail({
  heading,
  body,
  cta,
  url,
  footer,
}: {
  heading: string;
  body: string;
  cta: string;
  url: string;
  footer: string;
}) {
  const u = escapeHtml(url);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<h1 style="font-size:20px">${escapeHtml(heading)}</h1>
<p>${escapeHtml(body)}</p>
<p><a href="${u}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(cta)}</a></p>
<p style="font-size:12px;color:#666">${escapeHtml(footer)}</p>
</body></html>`;
  const text = `${heading}\n\n${body}\n\n${cta}: ${url}\n\n${footer}`;
  return { html, text };
}

/**
 * Creates the first admin (or updates an existing user) and hands them the legacy data.
 *
 *   pnpm seed:admin --email you@example.com [--username you]
 *
 * It asks for a password (not echoed) and sets it, so you can sign in with the email or the
 * username. Press Enter at the prompt to keep the current password. Re-running is safe.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { promoteAdmin } from "../src/admin";
import { createDb, resolveDatabaseUrl } from "../src/client";
import { runMigrations } from "../src/migrate";
import { loadEnv } from "./env";

loadEnv();

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = flag("email");
const username = flag("username");
if (!email) {
  console.error("Usage: pnpm seed:admin --email you@example.com [--username you]");
  process.exit(1);
}

// One reader for every prompt (separate readers would lose piped lines); output is muted while
// a password is typed so it isn't echoed.
let muted = false;
const rl = createInterface({
  input: process.stdin,
  output: new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  }),
  terminal: process.stdin.isTTY,
});
const lines = rl[Symbol.asyncIterator]();

async function askHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  muted = true;
  const { value, done } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return done ? "" : String(value);
}

let passwordHash: string | undefined;
const password = await askHidden("Password (min 8 characters; Enter = keep current): ");
if (password) {
  if (password.length < 8 || password.length > 128) {
    console.error("Passwords are 8-128 characters.");
    process.exit(1);
  }
  const again = await askHidden("Repeat password: ");
  if (again !== password) {
    console.error("The passwords don't match.");
    process.exit(1);
  }
  passwordHash = await hashPassword(password);
}
rl.close();

const db = createDb();
await runMigrations(db);
const { userId, created, reassigned } = await promoteAdmin(db, email, { username, passwordHash });
console.log(
  `${created ? "Created" : "Updated"} admin ${email} (${userId}) in ${resolveDatabaseUrl().replace(/\?.*$/, "")}`,
);
if (username) console.log(`Username: ${username.trim().toLowerCase()}`);
console.log(passwordHash ? "Password set." : "Password unchanged.");
console.log(`Reassigned ${reassigned} legacy rows.`);
db.$client.close();

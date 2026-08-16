// Loads .env safely (if dotenv is installed). Never logs or dumps secrets.
try {
  await import('dotenv/config');
} catch {
  // dotenv not installed — run on real environment vars.
}

export const env = process.env;

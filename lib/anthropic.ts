import Anthropic from "@anthropic-ai/sdk";

// Server-side Anthropic client. Reads ANTHROPIC_API_KEY from the environment.
// Import this only in server components / route handlers, never client code.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

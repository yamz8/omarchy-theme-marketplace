import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseThemeSubmission } from "./theme-submission.mjs";
import { validateCommunityThemeSource } from "./theme-source-validation.mjs";

export async function validateThemeSubmission(input) {
  try {
    const submission = parseThemeSubmission(input);
    const source = await validateCommunityThemeSource(submission);
    return { ok: true, submission, source };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: String(error?.code || "theme-validation-failed"),
        message: String(error?.message || "Theme validation failed."),
      },
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await validateThemeSubmission({
    title: process.env.ISSUE_TITLE,
    body: process.env.ISSUE_BODY,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

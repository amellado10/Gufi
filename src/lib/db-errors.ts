// Turn Postgres / PostgREST errors into messages a person can act on.
// Never echo raw database errors to the browser.
export function friendlyDbError(error: { code?: string; message?: string; details?: string } | null, what = "record"): string {
  if (!error) return "Something went wrong.";
  switch (error.code) {
    case "23505":
      return `A ${what} with the same details already exists.`;
    case "23503":
      return `That ${what} is linked to something that doesn't exist or still depends on it.`;
    case "23514":
      return `Some of the values aren't allowed. Check the form and try again.`;
    case "42501":
      return `You don't have permission to do that.`;
    default:
      console.error(`[db] ${error.code ?? "?"}: ${error.message ?? ""}`);
      return "Something went wrong saving your changes. Please try again.";
  }
}

export const REVIEW_REPO_URL = "https://github.com/gzxy/lespark_android";
export const REVIEW_STARTING_REF = "hsp/v9758_new_ai_subtitle_all";

export function cloudCreateOptions(apiKey: string) {
  return {
    apiKey,
    model: { id: "composer-2.5" },
    mode: "agent" as const,
    cloud: {
      repos: [{ url: REVIEW_REPO_URL, startingRef: REVIEW_STARTING_REF }],
      autoCreatePR: false,
    },
  };
}

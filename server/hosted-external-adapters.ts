/** Fixture model URLs implement only the model wire protocol, never third-party search or translation. */
export function hostedExternalAdapterPolicy(environment:NodeJS.ProcessEnv=process.env) {
  const fixtureModel=!!environment.HOSTED_MODEL_BASE_URL;
  return {
    fixtureModel,
    searchEnabled:!fixtureModel,
    translationsEnabled:!fixtureModel,
  };
}

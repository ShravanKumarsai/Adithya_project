export function collectWizardPolicy(values, previous = {}) {
  const list = (key) =>
    String(values[key] || "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  return {
    permitted_ai_tools: list("permitted_ai_tools"),
    prohibited_ai_tools: list("prohibited_ai_tools"),
    permitted_models: list("permitted_models"),
    other_requirements: values.other_requirements || "",
    privacy_restrictions: values.privacy_restrictions || "",
    data_handling: values.data_handling || "",
    external_ai_apis_allowed: values.external_ai_apis_allowed === "on",
    ai_generated_code_allowed: values.ai_generated_code_allowed === "on",
    ai_generated_research_allowed:
      values.ai_generated_research_allowed === "on",
    gemini_planning_allowed: previous.gemini_planning_allowed === true,
  };
}

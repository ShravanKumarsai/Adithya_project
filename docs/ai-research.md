# AI decisions for the student portal

## Where inference earns its cost

A lead can inspect a photographed rulebook and approve a quotation about AI use. A member can select a discussion and draft the task that two teammates agreed on. Both jobs involve interpreting prose. The app can count tasks, compare dates, find literal mentions, enforce a file-size limit and compute checklist coverage directly from project records. Use ordinary code for those operations.

| Job | Smallest useful input | Evidence the reviewer should see |
| --- | --- | --- |
| Extract rules | Selected pages or pasted rule text | Exact original-language quotation, page number or section, extracted value and qualifier such as “optional” |
| Plan to tasks | Approved requirements, dates and plan | Requirement ID for each proposed task, editable title and estimate |
| Suggest an assignee | Relevant skills, availability and task | Matching skill and available hours. Leave the owner empty when evidence is insufficient |
| Review submission | Rubric entries and submitted artifact descriptions | Checklist item, artifact ID and unresolved question. Only a person confirms compliance |
| Summarise discussion | Selected messages in a project thread | Message IDs per decision or action and one-line explanation. Omit inferred deadlines and owners |

## Provider and data handling

Retain the server-side Gemini integration for the first evaluation. The scanner already supports PDF and image inputs, the setup operation has a separate key, and a project lead can restrict team planning by provider and model. Gemini supports a subset of JSON Schema. OpenAI Structured Outputs offers a strict schema subset and explicit refusal handling as a comparison candidate. Changing provider would require team permission, evaluation on the same corpus and new key handling. A local text parser remains available for clearly labelled fields and offline review. [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output) · [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing) · [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)

Google lists standard Gemini 3.5 Flash-Lite at USD 0.30 per million input tokens and USD 2.50 per million output tokens including thinking, checked 24 November 2026. A 6,000-input, 600-output call at those rates costs roughly USD 0.0033 before retries, taxes or extra services. PDF rendering, OCR and language affect token counts. Compare providers on billed tokens, median and 95th-percentile latency for the same images and text. No provider latency benchmark has been run for this portal. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) · [OpenAI pricing](https://openai.com/api/pricing/)

For a scan, list the file or selected pages and the destination before sending. For a thread, show the message range and count. Include team skills only for the assignment action. Keep direct messages, unrelated conversations, credentials and attachment contents outside that payload. Use the project AI policy as a server-side gate. For a new project, ask the uploader for permission before the rulebook leaves the device. Quote in the original language and translate only the explanation into the user's chosen language. Explicitly test English, Tamil, Telugu and Hindi, including mixed-script screenshots, before claiming support for each.

## Proposal contract and release decision

Each item needs a typed value, source ID, page or section, verbatim quote, confidence band and one sentence explaining the inference. Check the quote against the supplied source after normalizing whitespace. For a scan, retain the page image for human review. Use high confidence only for an explicit, unambiguous match. Ambiguous dates or policy exceptions should produce a question or empty field. Validate enum values, field lengths, cross-project references, actual calendar dates and timezone separately from the JSON shape. A provider returning valid JSON can still return false information.

Limit summaries to five bullets. Retry malformed output once within the request budget, then show the manual form with the original input. Handle refusal, quota exhaustion, password-protected documents, unreadable scans and timeout explicitly. Refund reserved app quota on failure. Keep proposals in memory, record accepted edits once, and support a ten-second undo with conflict checks.

The existing scan contract on the foundation branch returns label and value, which cannot establish a page citation by itself. The corpus below is the acceptance test for new AI functionality. Keep new model-powered suggestions out of release until a held-out provider run establishes evidence quality and the reviewer can see each citation.

## Evaluation

See the dataset and reproducible baseline in [Evaluation notes](evals/README.md). Compare models against the same inputs without including the expected labels. Record model ID, prompt revision, per-case output, token cost, parse errors, citation validity, latency and abstentions. Require zero invented deadlines or expanded AI permissions, verbatim support for every proposed obligation, and at least 90% field recall on legible English text. Report each language and scan type separately. Failed cases remain available for manual entry.

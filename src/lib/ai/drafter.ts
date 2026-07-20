import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError } from "@/lib/errors";

// Raw, unvalidated shape the drafter is asked to produce. Validation of
// each candidate happens in src/lib/questions/draft.ts, before anything is
// persisted — this module's job is only to produce candidates or fail
// cleanly, never to decide what's valid.
export interface DraftedQuestionCandidate {
  type: unknown;
  prompt: unknown;
  options: unknown;
  correctOption: unknown;
}

export interface DraftPromptInput {
  lessonTitle: string;
  unitName: string;
  skillType: "SOFT" | "HARD";
  count: number;
}

export type AiQuestionDrafter = (input: DraftPromptInput) => Promise<DraftedQuestionCandidate[]>;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

function buildPrompt({ lessonTitle, unitName, skillType, count }: DraftPromptInput): string {
  return `أنت تساعد في إعداد أسئلة اختبار تدريبي لموظفي مبيعات في المملكة العربية السعودية.
الدرس: "${lessonTitle}"
الوحدة: "${unitName}" (${skillType === "SOFT" ? "مهارات لينة" : "مهارات تقنية"})

اكتب ${count} أسئلة اختيار من متعدد أو صح/خطأ باللغة العربية، مرتبطة مباشرة بمحتوى هذا الدرس.

أجب حصراً بمصفوفة JSON صالحة (بدون أي نص إضافي قبلها أو بعدها) بهذا الشكل بالضبط:
[
  {
    "type": "MCQ" | "TRUE_FALSE",
    "prompt": "نص السؤال",
    "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}],
    "correctOption": "a"
  }
]
لأسئلة صح/خطأ استخدم المعرّفين "true" و "false" فقط للخيارات.`;
}

function extractJsonArray(text: string): unknown {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new AiProviderError("AI response did not contain a parseable JSON array");
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new AiProviderError("AI response contained malformed JSON");
  }
}

// T-10: server-side AI call (Stack constraint). Provider/network failures
// (timeout, rate-limit, auth, unparseable response) are normalized to
// AiProviderError here so callers never see a raw SDK exception — this
// function either returns candidates or throws AiProviderError, nothing else.
export const anthropicDrafter: AiQuestionDrafter = async (input) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiProviderError("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
  } catch (error) {
    throw new AiProviderError(
      `AI provider request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const textBlock = response.content.find(
    (block): block is Extract<typeof block, { type: "text" }> => block.type === "text",
  );
  if (!textBlock) throw new AiProviderError("AI response contained no text content");

  const parsed = extractJsonArray(textBlock.text);
  if (!Array.isArray(parsed)) throw new AiProviderError("AI response JSON was not an array");
  return parsed as DraftedQuestionCandidate[];
};

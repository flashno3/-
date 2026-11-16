---
name: skill-finder
description: Finds and recommends skills for the user's task. Use when the user asks "which skill should I use", "is there a skill for X", "recommend a skill", asks what skills they have, or when a task (drafting in a house style, repeatable workflow, file-format work) might be served by a skill that is not yet enabled. Korean triggers - "스킬 찾아줘", "스킬 추천해줘", "무슨 스킬 있어?".
---

# Skill Finder

Find the skill that fits the user's task, using only what the tools actually return.

## Principles (data integrity first)

- Report only skills that appear in tool results. Never invent a skill name, description, or capability.
- Copy `name` and `description` from results verbatim; do not paraphrase them into claims the description does not make.
- State enabled/not-enabled status exactly as returned.
- If nothing matches, say so plainly. Do not pad with unrelated skills.

## Steps

1. **Clarify intent.** Extract 2-6 short keywords from the request (task, file format, domain). Include both English and Korean terms when the user writes in Korean.
2. **Check enabled skills.** Call `ListSkills` with the keywords (omit keywords if the user asked "what skills do I have").
3. **Search not-yet-enabled skills.** Call `SearchSkills` with the same keywords.
4. **Rank matches.** Keyword search also hits skills that merely mention a term in their description (e.g. a docx skill whose text says "Do NOT use for PDFs"). Split results into:
   - **Direct match**: the skill's name or its stated purpose is the user's task (e.g. `pdf` for PDF work). Recommend these first.
   - **Incidental match**: the term appears only in passing, or the description says not to use it for this task. Omit these, or list them under "관련 가능" without recommending. Never present them as recommendations.
   Judge from the description text actually returned; if unsure, put it under "관련 가능".
5. **Present or suggest.**
   - If `SuggestSkills` is available and results fit, call it (`trigger: "user_asked"` when the user asked, `"proactive"` otherwise) to render the add card.
   - Otherwise list the matches in text: name, one-line description, enabled or not.
6. **No match.**
   - User asked: tell them nothing relevant was found, and offer `skill-creator` to build one.
   - Proactive: continue the task without mentioning the search.

## Output format

```
추천 스킬
- <name> (활성화됨/미활성) — <description 요약, 원문 기준>

관련 가능 (단어만 일치, 추천 아님)
- <name> — <왜 직접 해당하지 않는지>

근거: ListSkills / SearchSkills 결과
```

If no results: "일치하는 스킬을 찾지 못했습니다." plus the `skill-creator` offer.

## Do not

- Recommend a skill you did not see in a tool result.
- Claim a skill is installed or enabled without the result saying so.
- Repeat a suggestion card if the user already ignored one this conversation.

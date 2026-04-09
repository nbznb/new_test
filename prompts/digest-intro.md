# Digest Intro Prompt

You are assembling the final Follow USTC digest from source summaries.

## Goal

Make the digest feel like a complete, high-signal campus and research briefing:
- action items first
- clear section hierarchy
- short paragraphs and bullets
- easy to scan on a phone screen

## Format

Start with this header:

Follow USTC Digest — [Date]

Then organize content in this order:

1. MUST-READ / IMPORTANT REMINDERS
2. USTC OFFICIAL
3. ACADEMIC AFFAIRS / NOTICES
4. TECH NEWS
5. RESEARCH / AI FRONTIER

## Section rules

- Only include items that are present in the JSON input
- Skip any empty section completely
- The first section is optional: only include MUST-READ / IMPORTANT REMINDERS if there are 1-3 items that clearly deserve priority
- MUST-READ / IMPORTANT REMINDERS should be selected from official news or academic notices only
- Prioritize items with deadlines, required actions, major policy or teaching changes, or especially important university developments
- Within each section, order items by:
  1. actionability
  2. urgency / timeliness
  3. impact

## Per-item structure

For every item, use this shape instead of long free-form paragraphs:

- First line: source name + item title
- Second line: `What matters:` followed by one sharp sentence
- Optional: add 1-3 short bullets only if they add concrete value
  - who is affected
  - deadline / date / location
  - required action
  - concrete research, product, or academic significance
- Last line: original source link

## Writing rules

- Every item must include the original source link
- Keep formatting compact, clean, and phone-friendly
- Use short paragraphs and short bullets
- Do not paste or paraphrase huge blocks of source text
- Lead with what matters: deadlines, major announcements, research value, concrete changes
- Official ceremonial or generic news should be compressed heavily
- Do not fabricate, speculate, or invent context beyond the JSON input
- If a detail is unclear from the input, omit it instead of guessing
- Only include content that actually exists in the JSON input

## Section guidance

### MUST-READ / IMPORTANT REMINDERS
- Use for the most actionable or high-priority campus items
- Keep this section short
- If nothing is urgent, omit the section entirely

### USTC OFFICIAL
- Focus on major campus developments, institutional decisions, and notable research achievements
- For research-heavy official items, emphasize the result and why it matters, not ceremonial wording

### ACADEMIC AFFAIRS / NOTICES
- Prioritize audience, deadline, submission path, time window, and what students or staff need to do
- If the notice is procedural, make the action path obvious

### TECH NEWS
- Emphasize what happened, why it matters, and the concrete implication for research, products, or industry
- Avoid generic hype commentary

### RESEARCH / AI FRONTIER
- Emphasize topic, core result, and why it is worth tracking
- If the source is more like frontier news than a paper abstract, present it honestly as a frontier development

## Ending

At the very end add:

Generated through the Follow USTC skill

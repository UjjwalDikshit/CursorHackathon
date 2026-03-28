import OpenAI from 'openai';

export type ModerationOutcome = {
  flagged: boolean;
  riskScore: number;
  categories: string[];
  model: string;
  moderationStatus: 'approved' | 'pending' | 'escalated';
};

/**
 * OpenAI Moderations API + lightweight spam heuristic.
 * High risk → escalated; medium → pending for human review.
 */
export async function moderateNewPost(
  apiKey: string | undefined,
  title: string,
  body: string,
): Promise<ModerationOutcome> {
  const text = `${title}\n\n${body}`;
  const heuristicSpam = spamHeuristicScore(title, body);

  if (!apiKey) {
    const risk = heuristicSpam;
    return {
      flagged: risk > 0.55,
      riskScore: risk,
      categories: risk > 0.55 ? ['heuristic_spam'] : [],
      model: 'none',
      moderationStatus:
        risk > 0.75 ? 'escalated' : risk > 0.45 ? 'pending' : 'approved',
    };
  }

  const client = new OpenAI({ apiKey });
  let r:
    | { flagged: boolean; category_scores: Record<string, number> }
    | undefined;
  let modelUsed = 'omni-moderation-latest';
  try {
    const mod = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });
    r = mod.results[0] as unknown as {
      flagged: boolean;
      category_scores: Record<string, number>;
    };
  } catch {
    try {
      const mod = await client.moderations.create({ input: text });
      r = mod.results[0] as unknown as {
        flagged: boolean;
        category_scores: Record<string, number>;
      };
      modelUsed = 'default';
    } catch {
      return {
        flagged: heuristicSpam > 0.55,
        riskScore: heuristicSpam,
        categories: heuristicSpam > 0.55 ? ['heuristic_fallback'] : [],
        model: 'error-fallback',
        moderationStatus:
          heuristicSpam > 0.75
            ? 'escalated'
            : heuristicSpam > 0.45
              ? 'pending'
              : 'approved',
      };
    }
  }

  if (!r) {
    return {
      flagged: false,
      riskScore: heuristicSpam,
      categories: [],
      model: modelUsed,
      moderationStatus: 'approved',
    };
  }

  const scores = r.category_scores as Record<string, number>;
  const entries = Object.entries(scores);
  const maxPolicy = Math.max(0, ...entries.map(([, v]) => v));
  const flaggedCats = entries.filter(([, v]) => v > 0.35).map(([k]) => k);

  const combined = Math.min(1, maxPolicy * 0.85 + heuristicSpam * 0.25);
  const flagged = r.flagged || combined > 0.72;

  let moderationStatus: ModerationOutcome['moderationStatus'] = 'approved';
  if (combined > 0.88 || flaggedCats.some((c) => /self-harm|violence|sexual/.test(c))) {
    moderationStatus = 'escalated';
  } else if (flagged || combined > 0.5) {
    moderationStatus = 'pending';
  }

  return {
    flagged,
    riskScore: Number(combined.toFixed(4)),
    categories: flaggedCats.slice(0, 12),
    model: modelUsed,
    moderationStatus,
  };
}

function spamHeuristicScore(title: string, body: string): number {
  const t = `${title} ${body}`;
  let s = 0;
  const urlCount = (t.match(/https?:\/\//gi) ?? []).length;
  if (urlCount > 4) s += 0.35;
  else if (urlCount > 2) s += 0.15;
  if (t.length < 30 && urlCount > 0) s += 0.25;
  const upper = (t.match(/[A-Z]/g) ?? []).length;
  const ratio = t.length ? upper / t.length : 0;
  if (ratio > 0.45 && t.length > 40) s += 0.2;
  if (/(.)\1{12,}/.test(t)) s += 0.15;
  return Math.min(1, s);
}

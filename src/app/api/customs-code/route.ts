import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";

type CustomsCodeCandidate = {
  code: string;
  name: string;
  expired: boolean;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function commonCharRatio(keyword: string, name: string) {
  if (!keyword || !name) return 0;

  const nameChars = new Set(Array.from(name));
  const matched = Array.from(new Set(Array.from(keyword))).filter((char) =>
    nameChars.has(char),
  ).length;

  return matched / Math.max(Array.from(new Set(Array.from(keyword))).length, 1);
}

function scoreCandidate(keyword: string, candidate: CustomsCodeCandidate) {
  const normalizedKeyword = normalizeForMatch(keyword);
  const normalizedName = normalizeForMatch(candidate.name);

  if (!normalizedKeyword || !normalizedName) return 0;

  let score = 0;
  if (normalizedName === normalizedKeyword) score += 1000;
  if (normalizedName.startsWith(normalizedKeyword)) score += 800;
  if (normalizedName.includes(normalizedKeyword)) score += 600;
  if (normalizedKeyword.includes(normalizedName)) score += 400;

  score += Math.round(commonCharRatio(normalizedKeyword, normalizedName) * 200);
  score -= Math.abs(normalizedName.length - normalizedKeyword.length);

  return score;
}

function parseCustomsCodeCandidates(html: string) {
  const rows = html.match(/<tr[^>]*class=["'][^"']*result-grid[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  return rows
    .map<CustomsCodeCandidate | null>((row) => {
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
        (match) => match[1] ?? "",
      );
      const codeCell = cells[0] ?? "";
      const nameCell = cells[1] ?? "";
      const code = codeCell.match(/\/Code\/(\d+)\.html/i)?.[1] ??
        stripTags(codeCell).match(/\b\d{8,13}\b/)?.[0];

      if (!code) return null;

      return {
        code,
        name: stripTags(nameCell),
        expired: /\[过期\]/.test(stripTags(codeCell)),
      };
    })
    .filter((item): item is CustomsCodeCandidate => Boolean(item));
}

async function lookupCustomsCode(keyword: string) {
  const response = await fetch(
    `https://www.hsbianma.com/search?keywords=${encodeURIComponent(keyword)}`,
    {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    throw new Error(`HS编码网查询失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const candidates = parseCustomsCodeCandidates(html);
  const availableCandidates = candidates.filter((item) => !item.expired);
  const rankedCandidates = (availableCandidates.length ? availableCandidates : candidates)
    .map((item) => ({
      ...item,
      score: scoreCandidate(keyword, item),
    }))
    .sort((a, b) => b.score - a.score);

  return rankedCandidates[0] ?? null;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);

  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim();

  if (!keyword) {
    return NextResponse.json({ data: null });
  }

  try {
    const candidate = await lookupCustomsCode(keyword);

    return NextResponse.json({
      data: candidate
        ? {
            customs_code: candidate.code,
            product_name: candidate.name,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "海关编码查询失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

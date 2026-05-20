import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getRequiredUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const url = requestUrl.searchParams.get("url")?.trim();

  if (!url) {
    throw new Error("缺少下载文件URL");
  }

  const targetUrl = new URL(url);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("下载文件URL格式不支持");
  }

  return targetUrl.toString();
}

function getFileName(request: Request) {
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams.get("filename")?.trim() || "download";
}

export async function GET(request: Request) {
  try {
    const targetUrl = getRequiredUrl(request);
    const fileName = getFileName(request);
    const response = await fetch(targetUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`文件读取失败：HTTP ${response.status}`);
    }

    const headers = new Headers();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");

    headers.set("content-type", contentType);
    headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件下载失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

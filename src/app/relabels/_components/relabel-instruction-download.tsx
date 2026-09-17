"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { App, Button, Tooltip } from "antd";
import { useRef, useState } from "react";

import type { RelabelRecord } from "../_lib/relabels";

export default function RelabelInstructionDownload({
  record,
}: {
  record: RelabelRecord;
}) {
  const { message } = App.useApp();
  const downloadingRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const supported = record.relabel_type === "外箱标";

  async function handleDownload() {
    if (downloadingRef.current || !supported) return;
    downloadingRef.current = true;
    setDownloading(true);

    try {
      const response = await fetch("/templates/rsh-relabel-instruction.xlsx");
      if (!response.ok) throw new Error("换标指令模板读取失败，请稍后重试");

      const { createRelabelInstruction } = await import("../_lib/relabel-instruction");
      const { buffer, fileName } = await createRelabelInstruction(
        record,
        await response.arrayBuffer(),
      );
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "换标指令下载失败，请稍后重试");
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }

  return (
    <Tooltip title={supported ? "下载换标指令" : "目前仅支持外箱标类型下载"}>
      <span>
        <Button
          type="text"
          size="small"
          aria-label="下载换标指令"
          icon={<DownloadOutlined />}
          disabled={!supported}
          loading={downloading}
          onClick={() => void handleDownload()}
        />
      </span>
    </Tooltip>
  );
}

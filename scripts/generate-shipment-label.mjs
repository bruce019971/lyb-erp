import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateShipmentLabels } from "../src/lib/shipment-label.ts";

// Use the project's asset directory even when invoked from another directory.
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("用法：npm run generate:shipment-label -- input.json output.pdf");
  process.exitCode = 1;
} else {
  try {
    const body = JSON.parse(await readFile(path.resolve(input), "utf8"));
    const target = path.resolve(output);
    process.chdir(fileURLToPath(new URL("../", import.meta.url)));
    const { buffer } = await generateShipmentLabels(body);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
    console.log(target);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "标签生成失败");
    process.exitCode = 1;
  }
}

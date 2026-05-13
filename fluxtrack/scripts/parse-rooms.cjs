// One-off script: parse the MMCM rooms .xlsx (unzipped to a path) into
// a JSON array of { room_no, capacity, room_type, room_name, caretaker }.
//
//   1. unzip ../replication/format/2T-25-26-Rooms.xlsx -d ./_rooms-xlsx
//   2. node scripts/parse-rooms.cjs ./_rooms-xlsx > rooms.json

const fs = require("fs");
const path = require("path");

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/parse-rooms.cjs <unzipped-xlsx-dir>");
  process.exit(1);
}

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ss = read("xl/sharedStrings.xml");
const sheet = read("xl/worksheets/sheet1.xml");

const strings = [];
for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const ts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((mm) => mm[1]).join("");
  strings.push(
    ts
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  );
}

const rows = [];
for (const row of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const rowNum = Number(row[1]);
  const cells = {};
  for (const c of row[2].matchAll(/<c\s+([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1];
    const inner = c[3] ?? "";
    const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
    if (!rMatch) continue;
    const col = rMatch[1];
    const tMatch = attrs.match(/t="([^"]*)"/);
    const type = tMatch ? tMatch[1] : "n";
    // Inline string: <c t="inlineStr"><is><t>value</t></is></c>
    if (type === "inlineStr") {
      const ts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");
      cells[col] = ts;
      continue;
    }
    const valMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
    if (!valMatch) continue;
    const raw = valMatch[1];
    if (type === "s") cells[col] = strings[Number(raw)];
    else cells[col] = raw;
  }
  rows.push({ rowNum, cells });
}
const header = rows[0].cells;
const HK = Object.entries(header).reduce((a, [k, v]) => ((a[v] = k), a), {});
const data = rows
  .slice(1)
  .filter((r) => Object.keys(r.cells).length > 0)
  .map((r) => ({
    room_no: r.cells[HK.RoomNo] ?? "",
    capacity: r.cells[HK.Capacity] ?? "",
    room_type: r.cells[HK.RoomType] ?? "",
    room_name: r.cells[HK.RoomName] ?? "",
    caretaker: r.cells[HK.CareTaker] ?? "",
  }));

process.stdout.write(JSON.stringify(data, null, 2));

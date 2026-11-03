// Data Analyst Workshop deck (Thai) — pptxgenjs structured deck
const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const fa = require("react-icons/fa6");
const sharp = require("sharp");
const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
const fs = require("fs");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const OUT = process.argv[2] || "deck.pptx";
const INCLUDE_DEPT = process.env.INCLUDE_DEPT === "1"; // detailed department slides: kept for the per-department courses

const HEX = {
  ink: "1B2631", white: "FFFFFF", deep: "0E3B43", mist: "EEF3F4",
  teal: "138A8A", amber: "F2A93B", coral: "E4572E", slate: "5B6C7A",
  aqua: "7FC8C3", blue: "2E5E8C", gray: "B7C1C8", grid: "E3E8EB",
};
const THEME = {
  name: "Data Analyst Workshop",
  headFontFace: "Tahoma",
  bodyFontFace: "Tahoma",
  colors: {
    dk1: HEX.ink, lt1: HEX.white, dk2: HEX.deep, lt2: HEX.mist,
    accent1: HEX.teal, accent2: HEX.amber, accent3: HEX.coral, accent4: HEX.slate,
    accent5: HEX.aqua, accent6: HEX.blue, hlink: HEX.teal, folHlink: HEX.slate,
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "Data Analyst: จากการเก็บข้อมูลสู่การนำเสนอผู้บริหาร";
pres.subject = "Data Analyst Workshop";
pres.author = "Data Analyst Workshop";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;

// ---------- icons ----------
const iconCache = {};
async function icon(name, hex) {
  const key = name + hex;
  if (iconCache[key]) return iconCache[key];
  const svg = RDS.renderToStaticMarkup(React.createElement(fa[name], { color: "#" + hex, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return (iconCache[key] = "image/png;base64," + buf.toString("base64"));
}

// ---------- layouts ----------
const motif = (x0, y0, scale, colors) =>
  [0.5, 0.8, 0.65, 1.1, 1.5].map((h, i) => ({
    rect: {
      x: x0 + i * 0.42 * scale, y: y0 - h * scale, w: 0.3 * scale, h: h * scale,
      fill: { color: colors[i] }, line: { type: "none" },
    },
  }));

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text2 },
  objects: [
    ...motif(8.9, 6.4, 2.0, [HEX.slate, HEX.teal, HEX.slate, HEX.teal, HEX.amber]),
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.9, w: 7.8, h: 2.6, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.75, w: 7.6, h: 1.6, fontSize: 18, color: C.accent5, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "SECTION",
  background: { color: C.text2 },
  objects: [
    ...motif(10.6, 6.6, 1.1, [HEX.slate, HEX.teal, HEX.slate, HEX.teal, HEX.amber]),
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 3.0, w: 9.5, h: 1.2, fontSize: 40, bold: true, color: C.background1, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 4.3, w: 9.5, h: 1.0, fontSize: 18, color: C.accent5, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.3, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.text2, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { text: { text: "Data Analyst Workshop  |  ตัวเลขในสไลด์เป็นข้อมูลตัวอย่างเพื่อการเรียนรู้", options: { x: 0.6, y: 7.02, w: 9, h: 0.3, fontSize: 10, color: C.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.slate, align: "right" },
});

// ---------- helpers ----------
let objN = 0;
const nm = (p) => `${p}-${++objN}`;
function T(slide, text, o) {
  slide.addText(text, { isTextBox: true, objectName: nm("text"), margin: 0, valign: "top", color: C.text1, fontSize: 14, ...o });
}
function card(slide, x, y, w, h, fill = C.background2, extra = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.1, objectName: nm("card"), ...extra });
}
async function iconCircle(slide, iconName, x, y, d, bg = C.accent1, fgHex = HEX.white) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { type: "none" }, objectName: nm("icon-bg") });
  const s = d * 0.52;
  slide.addImage({ data: await icon(iconName, fgHex), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, objectName: nm("icon"), altText: iconName });
}
function headline(slide, text) {
  T(slide, text, { x: 0.6, y: 1.2, w: 12.1, h: 0.5, fontSize: 18, bold: true, color: C.accent1, valign: "middle" });
}
const chartBase = () => ({
  catAxisLabelColor: HEX.slate, valAxisLabelColor: HEX.slate,
  catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
  catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
  dataLabelFontFace: "+mn-lt", dataLabelFontSize: 11, dataLabelColor: HEX.ink,
  titleFontFace: "+mn-lt", titleFontSize: 14, titleColor: HEX.ink,
  legendFontFace: "+mn-lt", legendFontSize: 11, legendColor: HEX.slate,
  valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: "none" },
  catAxisLineShow: true, catAxisLineColor: HEX.gray, valAxisLineShow: false,
  showLegend: false,
});

let sectionTitle = "";
function newSlide(masterName) {
  return pres.addSlide({ masterName, sectionTitle });
}
function section(title, num, subtitle, notes) {
  sectionTitle = title;
  pres.addSection({ title });
  const s = newSlide("SECTION");
  T(s, num, { x: 0.8, y: 1.6, w: 3, h: 1.3, fontSize: 66, bold: true, color: C.accent2, valign: "bottom" });
  s.addText(title, { placeholder: "title" });
  s.addText(subtitle, { placeholder: "body" });
  s.addNotes(notes);
  return s;
}

// department slide frame: chart area left, info panel right
async function deptPanel(s, { sources, kpis, action }) {
  const x = 8.75, w = 3.95;
  const blocks = [
    { t: "แหล่งข้อมูล", ic: "FaDatabase", body: sources, y: 1.9, h: 1.45 },
    { t: "KPI ที่ควรติดตาม", ic: "FaGaugeHigh", body: kpis, y: 3.5, h: 1.7 },
    { t: "ข้อเสนอต่อผู้บริหาร", ic: "FaLightbulb", body: action, y: 5.35, h: 1.45, hi: true },
  ];
  for (const b of blocks) {
    card(s, x, b.y, w, b.h, b.hi ? C.text2 : C.background2);
    await iconCircle(s, b.ic, x + 0.2, b.y + 0.18, 0.42, b.hi ? C.accent2 : C.accent1, b.hi ? HEX.deep : HEX.white);
    T(s, b.t, { x: x + 0.75, y: b.y + 0.18, w: w - 0.95, h: 0.42, fontSize: 15, bold: true, valign: "middle", color: b.hi ? C.background1 : C.text2 });
    const runs = b.body.map((line, i) => ({ text: line, options: { bullet: { indent: 14 }, breakLine: i < b.body.length - 1, paraSpaceAfter: 2 } }));
    T(s, runs, { x: x + 0.2, y: b.y + 0.68, w: w - 0.4, h: b.h - 0.78, fontSize: 13, color: b.hi ? C.background1 : C.text1 });
  }
}

(async () => {
  // =============== 1. Title ===============
  sectionTitle = "เปิดการบรรยาย";
  pres.addSection({ title: sectionTitle });
  {
    const s = newSlide("TITLE_DARK");
    T(s, "DATA ANALYST WORKSHOP", { x: 0.8, y: 1.2, w: 8, h: 0.4, fontSize: 14, bold: true, color: C.accent2, charSpacing: 4 });
    s.addText("Data Analyst: จากการเก็บข้อมูล สู่การนำเสนอผู้บริหาร", { placeholder: "title" });
    s.addText("เก็บอย่างไร • วิเคราะห์อย่างไร • เล่าอย่างไรให้ผู้บริหารตัดสินใจได้\nพร้อมตัวอย่าง HR • บัญชี • จัดซื้อ • QA • QC • R&D", { placeholder: "body" });
    s.addNotes("เปิดด้วยคำถามกับผู้ฟัง: \"ใครเคยทำรายงานเป็นสิบหน้า แต่ผู้บริหารดูแค่หน้าเดียว?\" ชี้ว่าวันนี้จะพาไล่ตั้งแต่จุดเริ่ม คือการตั้งคำถามและเก็บข้อมูล จนถึงการนำเสนอที่ทำให้เกิดการตัดสินใจ และจบด้วยตัวอย่างของทุกแผนกที่อยู่ในห้องนี้");
  }

  // =============== 2. Agenda ===============
  {
    const s = newSlide("CONTENT");
    s.addText("หัวข้อวันนี้", { placeholder: "title" });
    const items = [
      ["01", "รู้จัก Data Analyst", "บทบาท และ 6 ขั้นตอนการทำงาน", "FaRoute"],
      ["02", "การเก็บข้อมูล", "แหล่งข้อมูล วิธีเก็บ และตารางที่วิเคราะห์ได้", "FaClipboardList"],
      ["03", "วิเคราะห์ & เลือกกราฟ", "จับคู่คำถามกับกราฟ และออกแบบ KPI", "FaChartColumn"],
      ["04", "นำเสนอผู้บริหาร", "โครงเรื่อง กราฟที่สื่อสาร และ Dashboard", "FaPersonChalkboard"],
      ["05", "ภาพรวม 6 แผนก", "KPI และกราฟของแต่ละแผนก + แผนคอร์สถัดไป", "FaCircleNodes"],
    ];
    const cw = 2.26, gap = 0.2, y = 1.7;
    for (let i = 0; i < items.length; i++) {
      const [n, t, d, ic] = items[i];
      const x = 0.6 + i * (cw + gap);
      card(s, x, y, cw, 4.9, i === 4 ? C.text2 : C.background2);
      await iconCircle(s, ic, x + 0.3, y + 0.35, 0.85, i === 4 ? C.accent2 : C.accent1, i === 4 ? HEX.deep : HEX.white);
      T(s, n, { x: x + 0.3, y: y + 1.45, w: cw - 0.5, h: 0.8, fontSize: 40, bold: true, color: i === 4 ? C.accent2 : C.accent1 });
      T(s, t, { x: x + 0.3, y: y + 2.35, w: cw - 0.5, h: 0.95, fontSize: 18, bold: true, color: i === 4 ? C.background1 : C.text2 });
      T(s, d, { x: x + 0.3, y: y + 3.35, w: cw - 0.5, h: 1.3, fontSize: 14, color: i === 4 ? C.accent5 : C.accent4 });
    }
    s.addNotes("แนะนำเส้นทางของวันนี้ 5 ช่วง ช่วงที่ 1–4 เป็นหลักคิดที่ใช้ได้กับทุกแผนก ช่วงที่ 5 เป็นตัวอย่างเฉพาะแผนก แนะนำให้ผู้ฟังจดคำถามของแผนกตัวเองไว้ระหว่างฟัง");
  }

  // =============== Section 01 ===============
  section("รู้จัก Data Analyst", "01", "เปลี่ยนข้อมูลดิบ ให้เป็นการตัดสินใจที่ดีขึ้น",
    "ช่วงนี้ปูพื้นว่างาน Data Analyst ไม่ใช่แค่ทำกราฟ แต่คือการตอบคำถามธุรกิจด้วยข้อมูล");

  // 3. Analytics ladder
  {
    const s = newSlide("CONTENT");
    s.addText("Data Analyst ตอบคำถาม 4 ระดับ", { placeholder: "title" });
    T(s, "ยิ่งขึ้นบันไดสูง ยิ่งสร้างคุณค่าให้ธุรกิจมากขึ้น แต่ต้องมีข้อมูลที่ดีเป็นฐาน", { x: 0.6, y: 1.2, w: 12.1, h: 0.45, fontSize: 16, color: C.accent4, valign: "middle" });
    const steps = [
      ["Descriptive", "เกิดอะไรขึ้น?", "ยอดขายเดือนนี้ 12 ล้านบาท ลดลง 8%", "FaTable", HEX.gray],
      ["Diagnostic", "ทำไมถึงเกิด?", "ลูกค้ากลุ่ม B ลดการสั่งซื้อจากสินค้าขาดสต็อก", "FaMagnifyingGlass", HEX.aqua],
      ["Predictive", "จะเกิดอะไรต่อ?", "ถ้าไม่แก้ ไตรมาสหน้ายอดอาจลดอีก 5%", "FaChartLine", HEX.teal],
      ["Prescriptive", "ควรทำอะไร?", "เพิ่ม Safety stock 3 รายการหลัก ภายในเดือนนี้", "FaBullseye", HEX.amber],
    ];
    const bw = 2.9, gap = 0.17, base = 6.75;
    for (let i = 0; i < 4; i++) {
      const [en, th, ex, ic, col] = steps[i];
      const x = 0.6 + i * (bw + gap);
      const h = 2.0 + i * 0.75;
      const y = base - h;
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: bw, h, fill: { color: col }, line: { type: "none" }, objectName: nm("step") });
      const dark = i === 3 ? HEX.deep : i >= 2 ? HEX.white : HEX.deep;
      await iconCircle(s, ic, x + 0.25, y + 0.25, 0.6, C.background1, i === 0 ? HEX.slate : col);
      T(s, en, { x: x + 1.0, y: y + 0.25, w: bw - 1.15, h: 0.6, fontSize: 18, bold: true, color: dark, valign: "middle" });
      T(s, th, { x: x + 0.25, y: y + 1.0, w: bw - 0.45, h: 0.45, fontSize: 18, bold: true, color: dark });
      T(s, "ตัวอย่าง: " + ex, { x: x + 0.25, y: y + 1.5, w: bw - 0.45, h: 0.95, fontSize: 13, color: dark });
    }
    // value arrow
    s.addShape(pres.shapes.RIGHT_ARROW, { x: 0.6, y: 2.05, w: 3.4, h: 0.5, fill: { color: C.background2 }, line: { type: "none" }, objectName: nm("arrow") });
    T(s, "คุณค่าต่อธุรกิจเพิ่มขึ้น", { x: 0.75, y: 2.05, w: 3.0, h: 0.5, fontSize: 13, bold: true, color: C.text2, valign: "middle" });
    s.addNotes("อธิบายบันได 4 ขั้นด้วยตัวอย่างเดียวกันทั้งหมด (ยอดขาย) ให้เห็นว่าคำถามเปลี่ยนจาก 'อะไร' ไป 'ทำไม' ไป 'จะเกิดอะไร' และ 'ควรทำอะไร' ผู้บริหารต้องการขั้นที่ 3–4 แต่จะไปถึงได้ต้องมีข้อมูลขั้น 1–2 ที่ถูกต้องก่อน");
  }

  // 4. Process 6 steps
  {
    const s = newSlide("CONTENT");
    s.addText("6 ขั้นตอนการทำงานของ Data Analyst", { placeholder: "title" });
    const steps = [
      ["ตั้งคำถาม", "ผู้บริหารอยากรู้อะไร จะเอาไปตัดสินใจเรื่องไหน", "FaQuestion"],
      ["เก็บข้อมูล", "ระบุแหล่ง วิธีเก็บ ความถี่ และผู้รับผิดชอบ", "FaClipboardList"],
      ["ทำความสะอาด", "ลบซ้ำ เติมค่าว่าง แก้รูปแบบให้เป็นมาตรฐาน", "FaBroom"],
      ["วิเคราะห์", "เปรียบเทียบ หาแนวโน้ม หาสาเหตุ", "FaMagnifyingGlass"],
      ["สร้างภาพ", "เลือกกราฟให้ตรงกับคำถาม เน้นจุดสำคัญ", "FaChartPie"],
      ["นำเสนอ & ติดตาม", "สรุปข้อเสนอ ขอการตัดสินใจ วัดผลซ้ำ", "FaPersonChalkboard"],
    ];
    const cw = 1.85, gap = 0.2, y = 1.75;
    for (let i = 0; i < 6; i++) {
      const [t, d, ic] = steps[i];
      const x = 0.6 + i * (cw + gap);
      card(s, x, y, cw, 3.6);
      await iconCircle(s, ic, x + (cw - 0.9) / 2, y + 0.3, 0.9, i === 5 ? C.accent2 : C.accent1, i === 5 ? HEX.deep : HEX.white);
      T(s, `${i + 1}`, { x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.35, fontSize: 14, bold: true, color: C.accent4 });
      T(s, t, { x: x + 0.15, y: y + 1.35, w: cw - 0.3, h: 0.75, fontSize: 16, bold: true, color: C.text2, align: "center", valign: "middle" });
      T(s, d, { x: x + 0.18, y: y + 2.15, w: cw - 0.36, h: 1.35, fontSize: 13, color: C.text1, align: "center" });
      if (i < 5) s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + cw + 0.04, y: y + 0.6, w: 0.13, h: 0.3, rotate: 90, fill: { color: C.accent4 }, line: { type: "none" }, objectName: nm("chev") });
    }
    // loop back callout
    card(s, 0.6, 5.65, 12.1, 1.1, C.text2);
    await iconCircle(s, "FaLightbulb", 0.85, 5.85, 0.7, C.accent2, HEX.deep);
    T(s, [
      { text: "งานส่วนใหญ่อยู่ที่ขั้นที่ 1–3  ", options: { bold: true, color: C.accent2 } },
      { text: "ถ้าคำถามไม่ชัดหรือข้อมูลไม่สะอาด กราฟสวยแค่ไหนก็ให้คำตอบที่ผิด — และขั้นที่ 6 ต้องวนกลับไปวัดผลเสมอ", options: { color: C.background1 } },
    ], { x: 1.8, y: 5.75, w: 10.7, h: 0.9, fontSize: 15, valign: "middle" });
    s.addNotes("ให้ผู้ฟังสังเกตว่าเครื่องมืออย่าง Power BI อยู่ขั้นที่ 5 เท่านั้น ขั้นที่กินเวลาจริงคือ 1–3 ยกตัวอย่างงานที่เคยเจอ เช่น ข้อมูลชื่อลูกค้าสะกดต่างกันทำให้นับยอดซ้ำ");
  }

  // =============== Section 02 ===============
  section("การเก็บข้อมูล", "02", "เก็บให้ถูกตั้งแต่ต้น ประหยัดเวลาแก้ทีหลังหลายเท่า",
    "ช่วงนี้เป็นหัวใจของการเริ่มต้น หลายองค์กรมีข้อมูลเยอะแต่ใช้ไม่ได้ เพราะไม่ได้ออกแบบการเก็บตั้งแต่แรก");

  // 5. Start from question
  {
    const s = newSlide("CONTENT");
    s.addText("เริ่มจากคำถาม ไม่ใช่เริ่มจากข้อมูล", { placeholder: "title" });
    headline(s, "ตัวอย่าง: ผู้บริหารฝ่ายผลิตถามว่า \"ทำไมของเสียเดือนนี้เพิ่มขึ้น?\"");
    const cols = [
      ["คำถามธุรกิจ", "FaQuestion", "ของเสียเพิ่มขึ้นเพราะอะไร และจะลดได้อย่างไร"],
      ["ตัวชี้วัด (KPI)", "FaGaugeHigh", "% ของเสียต่อล็อต\n= ชิ้นเสีย ÷ ชิ้นที่ผลิต × 100"],
      ["ข้อมูลที่ต้องมี", "FaTable", "วันที่, กะ, ไลน์, เครื่องจักร, รหัสสินค้า, ประเภทของเสีย, จำนวนผลิต, จำนวนเสีย"],
      ["แหล่ง & วิธีเก็บ", "FaClipboardList", "Check sheet หน้าไลน์ทุกกะ + ยอดผลิตจากระบบ ERP/MES"],
    ];
    const cw = 2.85, gap = 0.23, y = 1.95;
    for (let i = 0; i < 4; i++) {
      const [t, ic, d] = cols[i];
      const x = 0.6 + i * (cw + gap);
      card(s, x, y, cw, 3.55);
      await iconCircle(s, ic, x + 0.25, y + 0.25, 0.7);
      T(s, `ขั้น ${i + 1}`, { x: x + 1.1, y: y + 0.25, w: cw - 1.3, h: 0.3, fontSize: 12, bold: true, color: C.accent4 });
      T(s, t, { x: x + 1.1, y: y + 0.55, w: cw - 1.3, h: 0.45, fontSize: 16, bold: true, color: C.text2 });
      T(s, d, { x: x + 0.25, y: y + 1.2, w: cw - 0.5, h: 2.2, fontSize: 15 });
      if (i < 3) s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + cw + 0.05, y: y + 1.6, w: 0.13, h: 0.3, rotate: 90, fill: { color: C.accent4 }, line: { type: "none" }, objectName: nm("chev") });
    }
    card(s, 0.6, 5.75, 12.1, 1.0, C.background2);
    await iconCircle(s, "FaTriangleExclamation", 0.8, 5.9, 0.7, C.accent3);
    T(s, [
      { text: "กับดักที่พบบ่อย: ", options: { bold: true, color: C.accent3 } },
      { text: "เก็บแค่ \"จำนวนของเสีย\" แต่ไม่เก็บ \"เครื่องจักร/กะ\" — จะรู้ว่าเสียเพิ่ม แต่ตอบไม่ได้ว่าเพราะอะไร" },
    ], { x: 1.7, y: 5.85, w: 10.8, h: 0.8, fontSize: 15, valign: "middle" });
    s.addNotes("ย้ำหลัก 'Question first' ให้ทุกแผนกลองเขียน 4 ช่องนี้ของตัวเอง ข้อมูลที่ต้องมีมาจากการคิดย้อนว่าต้องแยกวิเคราะห์ตามมิติใดบ้าง (เครื่อง กะ สินค้า) ถ้าไม่เก็บมิตินั้นตั้งแต่แรก จะวิเคราะห์หาสาเหตุไม่ได้");
  }

  // 6. Sources & methods grid
  {
    const s = newSlide("CONTENT");
    s.addText("แหล่งข้อมูลและวิธีการเก็บ", { placeholder: "title" });
    const items = [
      ["ระบบองค์กร (ERP / HRIS / บัญชี)", "ข้อมูลธุรกรรม: PO, ใบแจ้งหนี้, เงินเดือน, สต็อก", "ดึงรายงาน/Export เป็นประจำ", "FaServer"],
      ["แบบฟอร์มดิจิทัล", "Google Forms, MS Forms, แอปบนมือถือ", "บังคับช่องสำคัญ ใช้ dropdown ลดพิมพ์ผิด", "FaWpforms"],
      ["Check Sheet หน้างาน", "บันทึกของเสีย การตรวจ ความผิดปกติ", "ออกแบบช่องให้ตรงกับที่จะวิเคราะห์", "FaClipboardList"],
      ["เครื่องจักร / Sensor", "อุณหภูมิ น้ำหนัก เวลาเดินเครื่อง (PLC, IoT)", "อัตโนมัติ ละเอียด แต่ต้องดูแลการสอบเทียบ", "FaMicrochip"],
      ["แบบสอบถาม / สัมภาษณ์", "ความพึงพอใจพนักงาน ลูกค้า Exit interview", "ใช้สเกล 1–5 ให้เหมือนกันทุกรอบ", "FaComments"],
      ["ข้อมูลภายนอก", "ราคาวัตถุดิบ อัตราแลกเปลี่ยน สถิติอุตสาหกรรม", "ระบุแหล่งและวันที่ทุกครั้ง", "FaDatabase"],
    ];
    const cw = 3.9, ch = 2.45, gx = 0.2, gy = 0.25, y0 = 1.45;
    for (let i = 0; i < 6; i++) {
      const [t, what, tip, ic] = items[i];
      const x = 0.6 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * (ch + gy);
      card(s, x, y, cw, ch);
      await iconCircle(s, ic, x + 0.25, y + 0.25, 0.7);
      T(s, t, { x: x + 1.1, y: y + 0.22, w: cw - 1.3, h: 0.76, fontSize: 15, bold: true, color: C.text2, valign: "middle" });
      T(s, what, { x: x + 0.25, y: y + 1.1, w: cw - 0.5, h: 0.65, fontSize: 13 });
      T(s, [{ text: "เคล็ดลับ: ", options: { bold: true, color: C.accent1 } }, { text: tip }], { x: x + 0.25, y: y + 1.75, w: cw - 0.5, h: 0.6, fontSize: 13, color: C.accent4 });
    }
    s.addNotes("ชี้ให้เห็นว่าข้อมูลมีทั้งแบบที่ระบบเก็บให้อัตโนมัติ (ERP, Sensor) และแบบที่คนต้องบันทึก (Check sheet, Form) แบบที่คนบันทึกคือจุดที่ผิดพลาดบ่อยที่สุด ให้ใช้ dropdown และรหัสมาตรฐานเสมอ");
  }

  // 7. Bad vs good table
  {
    const s = newSlide("CONTENT");
    s.addText("ออกแบบตารางให้ \"วิเคราะห์ได้\"", { placeholder: "title" });
    const hdr = (t, fill) => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: fill }, align: "center" } });
    // bad
    card(s, 0.6, 1.45, 5.9, 3.65, C.background2);
    await iconCircle(s, "FaCircleXmark", 0.8, 1.6, 0.5, C.accent3);
    T(s, "แบบที่วิเคราะห์ยาก", { x: 1.45, y: 1.6, w: 4.8, h: 0.5, fontSize: 16, bold: true, color: C.accent3, valign: "middle" });
    s.addTable([
      [hdr("สินค้า", HEX.slate), hdr("ม.ค.", HEX.slate), hdr("ก.พ.", HEX.slate), hdr("หมายเหตุ", HEX.slate)],
      ["ขวด 500ml", "5 ชิ้น", "3", "ฉลากเบี้ยว+รอยขีด"],
      ["", "2", "-", "เครื่อง 2?"],
      ["ขวด 1L", "ไม่มี", "4 ชิ้น", ""],
      ["รวม", "7+", "7", ""],
    ], { x: 0.85, y: 2.25, w: 5.4, colW: [1.3, 0.95, 0.95, 2.2], fontSize: 12, color: HEX.ink, border: { type: "solid", pt: 0.75, color: HEX.gray }, fill: { color: HEX.white }, rowH: 0.5, valign: "middle", objectName: nm("table") });
    // good
    card(s, 6.8, 1.45, 5.9, 3.65, C.background2);
    await iconCircle(s, "FaCircleCheck", 7.0, 1.6, 0.5, C.accent1);
    T(s, "แบบที่วิเคราะห์ได้ (1 แถว = 1 เหตุการณ์)", { x: 7.65, y: 1.6, w: 4.9, h: 0.5, fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
    s.addTable([
      [hdr("วันที่", HEX.teal), hdr("สินค้า", HEX.teal), hdr("เครื่อง", HEX.teal), hdr("ประเภท", HEX.teal), hdr("จำนวน", HEX.teal)],
      ["2026-01-05", "B500", "M2", "ฉลากเบี้ยว", "3"],
      ["2026-01-05", "B500", "M2", "รอยขีด", "2"],
      ["2026-01-12", "B500", "M1", "ฉลากเบี้ยว", "2"],
      ["2026-02-03", "B1000", "M3", "รอยขีด", "4"],
    ], { x: 7.05, y: 2.25, w: 5.4, colW: [1.25, 0.95, 0.85, 1.4, 0.95], fontSize: 12, color: HEX.ink, border: { type: "solid", pt: 0.75, color: HEX.gray }, fill: { color: HEX.white }, rowH: 0.5, valign: "middle", align: "center", objectName: nm("table") });
    // rules
    const rules = [
      ["1 แถว = 1 เหตุการณ์", "ไม่ใช้เดือนเป็นหัวคอลัมน์"],
      ["1 คอลัมน์ = 1 เรื่อง", "ตัวเลขไม่ปนหน่วย (\"5 ชิ้น\")"],
      ["ห้าม Merge cell", "เติมค่าให้ครบทุกแถว"],
      ["ใช้รหัสมาตรฐาน", "dropdown สินค้า/เครื่อง/ประเภท"],
      ["วันที่รูปแบบเดียว", "เช่น ปปปป-ดด-วว"],
    ];
    const rw = 2.26, rg = 0.2;
    for (let i = 0; i < 5; i++) {
      const x = 0.6 + i * (rw + rg);
      card(s, x, 5.35, rw, 1.4, C.text2);
      T(s, rules[i][0], { x: x + 0.18, y: 5.47, w: rw - 0.36, h: 0.5, fontSize: 14, bold: true, color: C.accent2, valign: "middle" });
      T(s, rules[i][1], { x: x + 0.18, y: 5.97, w: rw - 0.36, h: 0.7, fontSize: 13, color: C.background1 });
    }
    s.addNotes("ให้ผู้ฟังหาจุดผิดในตารางซ้าย: เซลล์ว่าง, หน่วยปนตัวเลข, ใส่หลายเรื่องในช่องเดียว, เดือนเป็นคอลัมน์, เครื่องหมาย ? และค่าที่ไม่ใช่ตัวเลข ตารางขวาเรียกว่า Tidy data สามารถทำ Pivot ได้ทุกมิติทันที และต่อยอดเป็น Dashboard ได้");
  }

  // 8. Data quality 6 dimensions
  {
    const s = newSlide("CONTENT");
    s.addText("ตรวจคุณภาพข้อมูลก่อนวิเคราะห์ 6 ด้าน", { placeholder: "title" });
    const dims = [
      ["ถูกต้อง", "Accuracy", "ตรงกับความจริง เช่น ยอดในรายงาน = ยอดในระบบบัญชี"],
      ["ครบถ้วน", "Completeness", "ไม่มีช่องสำคัญว่าง เช่น ทุกรายการมีรหัสแผนก"],
      ["สอดคล้องกัน", "Consistency", "ชื่อเดียวกันทุกที่ เช่น \"บจก. เอ\" กับ \"A Co.\" คือรายเดียว"],
      ["ทันเวลา", "Timeliness", "อัปเดตทันรอบการตัดสินใจ เช่น ปิดยอดทุกวันที่ 3"],
      ["ถูกรูปแบบ", "Validity", "อยู่ในช่วงที่เป็นไปได้ เช่น อายุงานติดลบไม่ได้"],
      ["ไม่ซ้ำ", "Uniqueness", "1 เหตุการณ์บันทึกครั้งเดียว เช่น PO ไม่ถูกคีย์ซ้ำ"],
    ];
    const cw = 3.9, ch = 2.45, gx = 0.2, gy = 0.25, y0 = 1.45;
    for (let i = 0; i < 6; i++) {
      const [th, en, d] = dims[i];
      const x = 0.6 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * (ch + gy);
      card(s, x, y, cw, ch);
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.8, h: 0.8, fill: { color: C.accent1 }, line: { type: "none" }, objectName: nm("num") });
      T(s, `${i + 1}`, { x: x + 0.25, y: y + 0.25, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: C.background1, align: "center", valign: "middle" });
      T(s, th, { x: x + 1.25, y: y + 0.22, w: cw - 1.45, h: 0.5, fontSize: 18, bold: true, color: C.text2, valign: "middle" });
      T(s, en, { x: x + 1.25, y: y + 0.7, w: cw - 1.45, h: 0.35, fontSize: 13, italic: true, color: C.accent4 });
      T(s, d, { x: x + 0.25, y: y + 1.25, w: cw - 0.5, h: 1.1, fontSize: 14 });
    }
    s.addNotes("แนะนำให้ทำ checklist 6 ข้อนี้ทุกครั้งก่อนส่งรายงาน เทคนิคง่ายใน Excel: Remove Duplicates, Filter หาช่องว่าง, Data Validation, และกระทบยอดรวมกับระบบต้นทาง (Reconcile)");
  }

  // =============== Section 03 ===============
  section("วิเคราะห์ & เลือกกราฟ", "03", "คำถามต่างกัน ต้องใช้กราฟต่างกัน",
    "ช่วงนี้เน้นการเลือกกราฟให้ตรงกับคำถาม และการออกแบบ KPI ที่วัดผลได้จริง");

  // 9. Chart chooser with 5 mini native charts
  {
    const s = newSlide("CONTENT");
    s.addText("เลือกกราฟให้ตรงกับคำถาม", { placeholder: "title" });
    const cw = 2.26, gap = 0.2, y = 1.45, ch = 5.3;
    const minis = [
      { q: "เปรียบเทียบ", ex: "ยอดขายแต่ละสาขา ใครมากที่สุด?", g: "กราฟแท่ง (Bar)", ic: "FaChartBar" },
      { q: "แนวโน้มตามเวลา", ex: "ต้นทุน 12 เดือน ขึ้นหรือลง?", g: "กราฟเส้น (Line)", ic: "FaChartLine" },
      { q: "สัดส่วน", ex: "งบซื้อแบ่งเป็นหมวดอะไรบ้าง?", g: "โดนัท / แท่งซ้อน", ic: "FaChartPie" },
      { q: "การกระจาย", ex: "น้ำหนักสินค้ากระจายตัวแค่ไหน?", g: "ฮิสโตแกรม", ic: "FaChartColumn" },
      { q: "ความสัมพันธ์", ex: "ชั่วโมงอบรม สัมพันธ์กับผลงาน?", g: "กราฟกระจาย (Scatter)", ic: "FaCircleNodes" },
    ];
    for (let i = 0; i < 5; i++) {
      const m = minis[i];
      const x = 0.6 + i * (cw + gap);
      card(s, x, y, cw, ch);
      await iconCircle(s, m.ic, x + 0.2, y + 0.22, 0.55);
      T(s, m.q, { x: x + 0.85, y: y + 0.22, w: cw - 1.0, h: 0.55, fontSize: 15, bold: true, color: C.text2, valign: "middle" });
      T(s, m.ex, { x: x + 0.2, y: y + 0.9, w: cw - 0.4, h: 0.8, fontSize: 13, color: C.accent4 });
      card(s, x + 0.15, y + 1.8, cw - 0.3, 2.45, C.background1);
      T(s, m.g, { x: x + 0.2, y: y + 4.4, w: cw - 0.4, h: 0.7, fontSize: 14, bold: true, color: C.accent1, align: "center", valign: "middle" });
    }
    const cx = (i) => 0.6 + i * (cw + gap) + 0.2, cyy = y + 1.85, cwid = cw - 0.4, chh = 2.35;
    const mini = () => ({ ...chartBase(), x: 0, y: cyy, w: cwid, h: chh, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, valAxisHidden: true, valGridLine: { style: "none" } });
    s.addChart(pres.charts.BAR, [{ name: "ยอดขาย", labels: ["A", "B", "C", "D"], values: [42, 30, 25, 18] }],
      { ...mini(), x: cx(0), barDir: "bar", catAxisOrientation: "maxMin", chartColors: [HEX.amber, HEX.gray, HEX.gray, HEX.gray], barGapWidthPct: 40, objectName: "chart-mini-bar" });
    s.addChart(pres.charts.LINE, [{ name: "ต้นทุน", labels: ["ม.ค.", "", "", "เม.ย.", "", "", "ก.ค.", "", "", "ต.ค.", "", "ธ.ค."], values: [20, 21, 20, 23, 24, 23, 26, 27, 26, 29, 30, 32] }],
      { ...mini(), x: cx(1), chartColors: [HEX.teal], lineSize: 2.5, lineDataSymbol: "none", catAxisHidden: true, objectName: "chart-mini-line" });
    s.addChart(pres.charts.DOUGHNUT, [{ name: "สัดส่วน", labels: ["วัตถุดิบ", "บรรจุภัณฑ์", "อื่นๆ"], values: [60, 25, 15] }],
      { ...mini(), x: cx(2), chartColors: [HEX.teal, HEX.aqua, HEX.gray], holeSize: 55, showPercent: true, dataLabelColor: HEX.white, dataLabelFontSize: 9, objectName: "chart-mini-donut" });
    s.addChart(pres.charts.BAR, [{ name: "ความถี่", labels: ["496", "498", "500", "502", "504"], values: [3, 11, 20, 12, 4] }],
      { ...mini(), x: cx(3), chartColors: [HEX.teal], barGapWidthPct: 5, objectName: "chart-mini-hist" });
    s.addChart(pres.charts.SCATTER, [
      { name: "X", values: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22] },
      { name: "ผลงาน", values: [55, 60, 58, 66, 70, 68, 75, 78, 76, 84] },
    ], { ...mini(), x: cx(4), chartColors: [HEX.teal], lineSize: 0, lineDataSymbol: "circle", lineDataSymbolSize: 6, valAxisHidden: true, catAxisHidden: true, objectName: "chart-mini-scatter" });
    s.addNotes("ใช้สไลด์นี้เป็นแผนที่: ก่อนทำกราฟให้ถามว่า 'คำถามของเราเป็นแบบไหนใน 5 แบบนี้' หลีกเลี่ยงกราฟวงกลมเมื่อมีมากกว่า 4–5 หมวด และหลีกเลี่ยงกราฟ 3 มิติทุกกรณี เพราะทำให้อ่านค่าผิด");
  }

  // 10. KPI design
  {
    const s = newSlide("CONTENT");
    s.addText("ออกแบบ KPI ให้วัดผลได้จริง", { placeholder: "title" });
    const smart = [["S", "Specific", "ชัดเจน วัดเรื่องเดียว"], ["M", "Measurable", "มีสูตรคำนวณ"], ["A", "Achievable", "ทำได้จริง"], ["R", "Relevant", "ผูกกับเป้าหมายองค์กร"], ["T", "Time-bound", "มีรอบเวลาชัดเจน"]];
    T(s, "KPI ที่ดีต้อง SMART", { x: 0.6, y: 1.35, w: 5.6, h: 0.45, fontSize: 18, bold: true, color: C.text2, valign: "middle" });
    for (let i = 0; i < 5; i++) {
      const y = 1.95 + i * 0.95;
      card(s, 0.6, y, 5.6, 0.8);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 0.8, h: 0.8, rectRadius: 0.1, fill: { color: C.accent1 }, line: { type: "none" }, objectName: nm("smart") });
      T(s, smart[i][0], { x: 0.6, y, w: 0.8, h: 0.8, fontSize: 26, bold: true, color: C.background1, align: "center", valign: "middle" });
      T(s, smart[i][1], { x: 1.6, y, w: 1.9, h: 0.8, fontSize: 16, bold: true, color: C.text2, valign: "middle" });
      T(s, smart[i][2], { x: 3.5, y, w: 2.6, h: 0.8, fontSize: 14, valign: "middle" });
    }
    // KPI card anatomy
    T(s, "1 KPI ต้องมี 5 องค์ประกอบ", { x: 6.7, y: 1.35, w: 6.0, h: 0.45, fontSize: 18, bold: true, color: C.text2, valign: "middle" });
    card(s, 6.7, 1.95, 6.0, 3.6, C.text2);
    const rows = [
      ["ชื่อ KPI", "อัตราการส่งมอบตรงเวลา (OTD)"],
      ["สูตร", "PO ที่ส่งตรงเวลา ÷ PO ทั้งหมด × 100"],
      ["เป้าหมาย", "≥ 95% ต่อเดือน"],
      ["แหล่งข้อมูล", "ERP: วันนัดส่ง vs วันรับของจริง"],
      ["เจ้าของ / รอบ", "ฝ่ายจัดซื้อ / รายงานทุกวันที่ 5"],
    ];
    rows.forEach(([k, v], i) => {
      const y = 2.15 + i * 0.65;
      T(s, k, { x: 6.95, y, w: 1.75, h: 0.55, fontSize: 14, bold: true, color: C.accent2, valign: "middle" });
      T(s, v, { x: 8.75, y, w: 3.8, h: 0.55, fontSize: 14, color: C.background1, valign: "middle" });
    });
    // leading vs lagging
    card(s, 6.7, 5.75, 2.9, 1.0);
    T(s, [{ text: "Lagging (ผลลัพธ์)\n", options: { bold: true, color: C.text2 } }, { text: "Turnover %, ยอดขาย, ของเสีย", options: { color: C.accent4 } }], { x: 6.9, y: 5.82, w: 2.6, h: 0.86, fontSize: 13, valign: "middle" });
    card(s, 9.8, 5.75, 2.9, 1.0);
    T(s, [{ text: "Leading (ตัวนำ)\n", options: { bold: true, color: C.text2 } }, { text: "ชม.อบรม, % PM ตามแผน", options: { color: C.accent4 } }], { x: 10.0, y: 5.82, w: 2.6, h: 0.86, fontSize: 13, valign: "middle" });
    s.addNotes("ยกตัวอย่าง KPI ที่ไม่ดี เช่น 'พัฒนาคุณภาพให้ดีขึ้น' (ไม่มีสูตร ไม่มีเป้า) แล้วแปลงเป็น KPI ที่ดี ชี้ความต่างของ Lagging (ดูผลที่เกิดไปแล้ว) กับ Leading (ตัวบอกล่วงหน้า ที่จัดการได้) ผู้บริหารควรเห็นทั้งสองแบบคู่กัน");
  }

  // =============== Section 04 ===============
  section("นำเสนอผู้บริหาร", "04", "ผู้บริหารต้องการคำตอบ และสิ่งที่ต้องตัดสินใจ",
    "ช่วงนี้คือการเปลี่ยนการวิเคราะห์ให้เป็นการสื่อสาร ผู้บริหารมีเวลาจำกัด ต้องได้ข้อสรุปภายใน 1 นาทีแรก");

  // 11. Pyramid storyline
  {
    const s = newSlide("CONTENT");
    s.addText("เล่าเรื่องแบบพีระมิด: บอกคำตอบก่อน", { placeholder: "title" });
    // pyramid from trapezoid-like stacked rects (centered, narrowing)
    const levels = [
      { t: "ข้อสรุป / ข้อเสนอ", d: "\"ควรเปลี่ยนซัพพลายเออร์ C ภายใน Q1\"", w: 3.4, col: C.accent2, fc: C.text2 },
      { t: "เหตุผลสนับสนุน 3 ข้อ", d: "ส่งช้า • ของเสียสูง • ราคาไม่ต่ำกว่า", w: 4.8, col: C.accent1, fc: C.background1 },
      { t: "ข้อมูลและหลักฐาน", d: "กราฟ OTD, Pareto ของเสีย, เทียบราคา", w: 6.2, col: C.text2, fc: C.background1 },
    ];
    const cx = 0.6 + 6.2 / 2;
    levels.forEach((L, i) => {
      const y = 1.6 + i * 1.75;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx - L.w / 2, y, w: L.w, h: 1.55, rectRadius: 0.1, fill: { color: L.col }, line: { type: "none" }, objectName: nm("pyr") });
      T(s, L.t, { x: cx - L.w / 2 + 0.2, y: y + 0.18, w: L.w - 0.4, h: 0.5, fontSize: 17, bold: true, color: L.fc, align: "center", valign: "middle" });
      T(s, L.d, { x: cx - L.w / 2 + 0.2, y: y + 0.72, w: L.w - 0.4, h: 0.7, fontSize: 13, color: L.fc, align: "center" });
    });
    // right: 4-part formula
    T(s, "สูตร 4 ประโยค สำหรับทุกการนำเสนอ", { x: 7.3, y: 1.6, w: 5.4, h: 0.45, fontSize: 17, bold: true, color: C.text2, valign: "middle" });
    const f = [
      ["เราพบว่า…", "ข้อค้นพบสำคัญ 1 เรื่อง", "FaMagnifyingGlass"],
      ["ซึ่งส่งผลให้…", "ผลกระทบเป็นบาท เวลา หรือความเสี่ยง", "FaTriangleExclamation"],
      ["จึงเสนอให้…", "ทางเลือกที่แนะนำ และต้นทุน", "FaLightbulb"],
      ["ขอให้ตัดสินใจ…", "อนุมัติอะไร ภายในเมื่อไร", "FaCircleCheck"],
    ];
    for (let i = 0; i < 4; i++) {
      const y = 2.2 + i * 1.15;
      card(s, 7.3, y, 5.4, 1.0);
      await iconCircle(s, f[i][2], 7.45, y + 0.17, 0.66, i === 3 ? C.accent2 : C.accent1, i === 3 ? HEX.deep : HEX.white);
      T(s, f[i][0], { x: 8.3, y: y + 0.1, w: 4.2, h: 0.42, fontSize: 16, bold: true, color: C.text2, valign: "middle" });
      T(s, f[i][1], { x: 8.3, y: y + 0.52, w: 4.2, h: 0.4, fontSize: 13, color: C.accent4, valign: "middle" });
    }
    s.addNotes("หลัก Pyramid Principle: ผู้บริหารอยากรู้ข้อสรุปก่อน แล้วค่อยลงรายละเอียดถ้าสงสัย ต่างจากรายงานทั่วไปที่เล่าจากข้อมูลไปหาข้อสรุป ให้ผู้ฟังฝึกเขียน 4 ประโยคนี้สำหรับเรื่องของแผนกตัวเองภายใน 3 นาที");
  }

  // 12. Before / after chart
  {
    const s = newSlide("CONTENT");
    s.addText("ก่อน–หลัง: ทำกราฟให้ \"สื่อสาร\" ได้ใน 5 วินาที", { placeholder: "title" });
    card(s, 0.6, 1.45, 5.9, 4.25, C.background2);
    card(s, 6.8, 1.45, 5.9, 4.25, C.background2);
    await iconCircle(s, "FaCircleXmark", 0.8, 1.6, 0.5, C.accent3);
    T(s, "ก่อน: ข้อมูลครบ แต่ไม่บอกอะไร", { x: 1.45, y: 1.6, w: 4.9, h: 0.5, fontSize: 16, bold: true, color: C.accent3, valign: "middle" });
    await iconCircle(s, "FaCircleCheck", 7.0, 1.6, 0.5, C.accent1);
    T(s, "หลัง: บอกคำตอบตั้งแต่หัวกราฟ", { x: 7.65, y: 1.6, w: 4.9, h: 0.5, fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
    const q = ["Q1", "Q2", "Q3", "Q4"];
    s.addChart(pres.charts.BAR, [
      { name: "ไลน์ A", labels: q, values: [30, 28, 32, 30] },
      { name: "ไลน์ B", labels: q, values: [25, 22, 24, 24] },
      { name: "ไลน์ C", labels: q, values: [50, 60, 70, 80] },
      { name: "ไลน์ D", labels: q, values: [28, 27, 26, 29] },
      { name: "ไลน์ E", labels: q, values: [35, 30, 33, 32] },
    ], { ...chartBase(), x: 0.8, y: 2.2, w: 5.5, h: 3.35, barDir: "col", showLegend: true, legendPos: "r", showValue: true, dataLabelFontSize: 8,
      chartColors: ["E15759", "4E79A7", "59A14F", "F28E2B", "B07AA1"], valGridLine: { color: "C9CED2", size: 1 }, catGridLine: { color: "C9CED2", size: 1 },
      showTitle: true, title: "ของเสียรายไลน์", objectName: "chart-before" });
    s.addChart(pres.charts.BAR, [{ name: "ของเสียทั้งปี (ชิ้น)", labels: ["ไลน์ C", "ไลน์ E", "ไลน์ A", "ไลน์ D", "ไลน์ B"], values: [260, 130, 120, 110, 95] }],
      { ...chartBase(), x: 7.0, y: 2.2, w: 5.5, h: 3.35, barDir: "bar", catAxisOrientation: "maxMin", valAxisHidden: true, valGridLine: { style: "none" },
        chartColors: [HEX.coral, HEX.gray, HEX.gray, HEX.gray, HEX.gray], barGapWidthPct: 45, showValue: true, dataLabelPosition: "outEnd",
        showTitle: true, title: "ไลน์ C มีของเสียเกือบ 2 เท่าของไลน์อื่น", titleColor: HEX.coral, objectName: "chart-after" });
    const tips = [["หัวกราฟ = ข้อสรุป", "ไม่ใช่แค่ชื่อข้อมูล"], ["สีเน้นจุดเดียว", "ที่เหลือใช้สีเทา"], ["เรียงลำดับค่า", "มาก → น้อย"], ["ตัดสิ่งรบกวน", "เส้นกริด legend 3 มิติ"]];
    const tw = 2.86, tg = 0.22;
    tips.forEach(([a, b], i) => {
      const x = 0.6 + i * (tw + tg);
      card(s, x, 5.9, tw, 0.88, C.text2);
      T(s, [{ text: a + "\n", options: { bold: true, color: C.accent2 } }, { text: b, options: { color: C.background1 } }], { x: x + 0.2, y: 5.95, w: tw - 0.4, h: 0.78, fontSize: 13, valign: "middle" });
    });
    s.addNotes("ให้ผู้ฟังดูกราฟซ้าย 5 วินาทีแล้วถามว่าได้ข้อสรุปอะไร จากนั้นเปิดกราฟขวา ข้อมูลชุดเดียวกัน (รวมทั้งปี) แต่เปลี่ยนวิธีนำเสนอ: หัวกราฟเป็นข้อสรุป เรียงค่า ใช้สีแดงเน้นเฉพาะจุดที่ต้องสนใจ และตัด legend/เส้นกริดออก");
  }

  // 13. Executive dashboard mock
  {
    const s = newSlide("CONTENT");
    s.addText("Dashboard 1 หน้าสำหรับผู้บริหาร", { placeholder: "title" });
    card(s, 0.6, 1.45, 8.9, 5.35, C.background2);
    const kpis = [["ยอดขาย", "12.4 ล้าน", "▲ 6% vs เป้า", HEX.teal], ["Gross Margin", "28.5%", "▼ 1.2 pt", HEX.coral], ["% ของเสีย", "1.8%", "▲ ดีกว่าเป้า 2%", HEX.teal], ["Turnover", "1.6%", "● ตามเป้า", HEX.slate]];
    kpis.forEach(([k, v, d, col], i) => {
      const x = 0.8 + i * 2.15;
      card(s, x, 1.65, 2.0, 1.25, C.background1);
      T(s, k, { x: x + 0.15, y: 1.72, w: 1.7, h: 0.3, fontSize: 11, color: C.accent4 });
      T(s, v, { x: x + 0.15, y: 2.0, w: 1.75, h: 0.5, fontSize: 22, bold: true, color: C.text2, valign: "middle" });
      T(s, d, { x: x + 0.15, y: 2.5, w: 1.75, h: 0.3, fontSize: 10, bold: true, color: col });
    });
    card(s, 0.8, 3.1, 5.0, 2.3, C.background1);
    s.addChart(pres.charts.LINE, [
      { name: "จริง", labels: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย."], values: [10.8, 11.2, 11.0, 11.9, 12.1, 12.4] },
      { name: "เป้า", labels: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย."], values: [11, 11.2, 11.4, 11.6, 11.8, 12.0] },
    ], { ...chartBase(), x: 0.9, y: 3.15, w: 4.8, h: 2.2, chartColors: [HEX.teal, HEX.gray], lineSize: 2, lineDataSymbol: "none", catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
      showTitle: true, title: "ยอดขายรายเดือน (ล้านบาท) vs เป้า", titleFontSize: 10, showLegend: true, legendPos: "t", legendFontSize: 9, valAxisMinVal: 10, objectName: "chart-dash-line" });
    card(s, 6.0, 3.1, 3.3, 2.3, C.background1);
    s.addChart(pres.charts.BAR, [{ name: "% ของเสีย", labels: ["ไลน์ C", "ไลน์ E", "ไลน์ A"], values: [3.4, 1.6, 1.4] }],
      { ...chartBase(), x: 6.05, y: 3.15, w: 3.2, h: 2.2, barDir: "bar", catAxisOrientation: "maxMin", valAxisHidden: true, valGridLine: { style: "none" }, catAxisLabelFontSize: 9,
        chartColors: [HEX.coral, HEX.gray, HEX.gray], showValue: true, dataLabelFontSize: 9, dataLabelFormatCode: "0.0\"%\"", showTitle: true, title: "% ของเสีย สูงสุด 3 ไลน์", titleFontSize: 10, objectName: "chart-dash-bar" });
    card(s, 0.8, 5.6, 8.5, 1.0, C.background1);
    T(s, [
      { text: "สิ่งที่ต้องตัดสินใจ: ", options: { bold: true, color: C.accent3 } },
      { text: "อนุมัติงบซ่อมเครื่องบรรจุไลน์ C 450,000 บาท  •  ทบทวนราคาขายกลุ่มสินค้า B เพื่อกู้ Margin" },
    ], { x: 1.0, y: 5.65, w: 8.1, h: 0.9, fontSize: 12, valign: "middle" });
    // annotations
    const ann = [
      ["ภาพรวมใน 5 วินาที", "KPI 4–6 ตัว พร้อมเทียบเป้า และลูกศรสี", 1.65],
      ["แนวโน้ม & จุดผิดปกติ", "กราฟเส้นดูทิศทาง กราฟแท่งชี้จุดที่ต้องแก้", 3.35],
      ["การตัดสินใจ", "ระบุสิ่งที่ต้องอนุมัติ ตัวเลข และกำหนดเวลา", 5.45],
    ];
    ann.forEach(([t, d, y], i) => {
      s.addShape(pres.shapes.OVAL, { x: 9.8, y, w: 0.6, h: 0.6, fill: { color: C.accent2 }, line: { type: "none" }, objectName: nm("ann") });
      T(s, `${i + 1}`, { x: 9.8, y, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: C.text2, align: "center", valign: "middle" });
      T(s, t, { x: 10.55, y: y - 0.02, w: 2.15, h: 0.45, fontSize: 15, bold: true, color: C.text2, valign: "middle" });
      T(s, d, { x: 10.55, y: y + 0.45, w: 2.15, h: 0.95, fontSize: 13, color: C.accent4 });
    });
    s.addNotes("อธิบายการจัดวางแบบอ่านจากบนลงล่าง ซ้ายไปขวา: ชั้นบนคือภาพรวม ชั้นกลางคือแนวโน้มและจุดผิดปกติ ชั้นล่างคือสิ่งที่ต้องตัดสินใจ ใช้สีแดงเฉพาะสิ่งที่ผิดเป้า สีเขียวอมฟ้าสำหรับสิ่งที่ดี และสีเทาสำหรับข้อมูลอ้างอิง");
  }

  // =============== Section 05 ===============
  section("ภาพรวม 6 แผนก", "05", "HR • บัญชี • จัดซื้อ • QA • QC • R&D — เจาะลึกแต่ละแผนกในคอร์สถัดไป",
    "ช่วงนี้เป็นภาพรวมว่าแต่ละแผนกใช้หลักการเดียวกันอย่างไร รายละเอียดเชิงลึกพร้อมข้อมูลจริงของแต่ละแผนกจะอยู่ในคอร์สถัดไป");

  // 14. Overview of departments
  {
    const s = newSlide("CONTENT");
    s.addText("แต่ละแผนก ผู้บริหารอยากรู้อะไร", { placeholder: "title" });
    const d = [
      ["HR", "ทรัพยากรบุคคล", "คนพอไหม รักษาคนเก่งไว้ได้ไหม", "FaUsers"],
      ["บัญชี", "Account", "กำไรเป็นไปตามแผนไหม เงินสดพอไหม", "FaCalculator"],
      ["จัดซื้อ", "Purchasing", "ซื้อได้ราคาดี ส่งตรงเวลาไหม", "FaCartShopping"],
      ["QA", "Quality Assurance", "ระบบคุณภาพป้องกันปัญหาถึงลูกค้าได้ไหม", "FaShieldHalved"],
      ["QC", "Quality Control", "ผลิตได้ตามสเปกไหม ของเสียเท่าไร", "FaMagnifyingGlass"],
      ["R&D", "วิจัยและพัฒนา", "สินค้าใหม่ออกทันเวลาและสร้างรายได้ไหม", "FaFlask"],
    ];
    const cw = 3.9, ch = 2.45, gx = 0.2, gy = 0.25, y0 = 1.45;
    for (let i = 0; i < 6; i++) {
      const [n, en, q, ic] = d[i];
      const x = 0.6 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * (ch + gy);
      card(s, x, y, cw, ch);
      await iconCircle(s, ic, x + 0.25, y + 0.25, 0.85);
      T(s, n, { x: x + 1.3, y: y + 0.25, w: cw - 1.5, h: 0.5, fontSize: 22, bold: true, color: C.text2, valign: "middle" });
      T(s, en, { x: x + 1.3, y: y + 0.75, w: cw - 1.5, h: 0.35, fontSize: 13, color: C.accent4 });
      T(s, [{ text: "คำถามหลัก: ", options: { bold: true, color: C.accent1 } }, { text: q }], { x: x + 0.25, y: y + 1.35, w: cw - 0.5, h: 0.95, fontSize: 14 });
    }
    s.addNotes("ให้แต่ละแผนกยืนยันว่าคำถามหลักนี้ตรงกับที่ผู้บริหารของตนถามจริงหรือไม่ และจดคำถามเพิ่มเติมไว้ใช้ในคอร์สเจาะลึกของแผนก ทุกแผนกใช้หลักการเดียวกับที่เรียนวันนี้: คำถาม → KPI → ข้อมูล → กราฟ → ข้อเสนอ");
  }

  const chartCard = (s) => card(s, 0.6, 1.9, 7.9, 4.9, C.background2);
  const deptTitle = async (s, title, ic) => {
    s.addText(title, { placeholder: "title" });
  };

  if (INCLUDE_DEPT) {
  // 15. HR
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "HR: อัตราการลาออก (Turnover)");
    headline(s, "Turnover สูงเกินเป้าช่วง พ.ค.–ก.ค. ตรงกับช่วงรับพนักงานใหม่จำนวนมาก");
    chartCard(s);
    const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    s.addChart(pres.charts.LINE, [
      { name: "Turnover จริง (%)", labels: m, values: [1.2, 1.4, 1.3, 1.6, 2.1, 2.4, 2.2, 1.8, 1.6, 1.5, 1.4, 1.3] },
      { name: "เป้าหมาย (%)", labels: m, values: Array(12).fill(1.5) },
    ], { ...chartBase(), x: 0.75, y: 2.0, w: 7.6, h: 4.7, chartColors: [HEX.teal, HEX.coral], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 7,
      showLegend: true, legendPos: "t", showValue: false, valAxisMinVal: 0, valAxisMaxVal: 3, valAxisMajorUnit: 0.5, valAxisLabelFormatCode: "0.0",
      showValAxisTitle: true, valAxisTitle: "% ต่อเดือน", valAxisTitleFontFace: "+mn-lt", valAxisTitleFontSize: 11, valAxisTitleColor: HEX.slate, objectName: "chart-hr" });
    await deptPanel(s, {
      sources: ["HRIS: ข้อมูลพนักงาน วันเข้า–ออก", "ใบลาออก + Exit interview", "ระบบลงเวลา / ใบลา"],
      kpis: ["Turnover % (รวม / อายุงาน < 1 ปี)", "Time-to-hire (วัน)", "ชั่วโมงอบรม / คน / ปี", "อัตราการขาดงาน (Absenteeism)"],
      action: ["ปรับ Onboarding + ระบบพี่เลี้ยง 90 วัน", "ติดตาม Turnover กลุ่มอายุงาน < 1 ปี ทุกเดือน"],
    });
    s.addNotes("สูตร Turnover รายเดือน = จำนวนผู้ลาออกในเดือน ÷ จำนวนพนักงานเฉลี่ยในเดือน × 100 ชี้ว่าเส้นเป้าหมายช่วยให้ผู้บริหารเห็นทันทีว่าช่วงไหนผิดปกติ แนะนำให้แยก Turnover ตามอายุงานและแผนกเพื่อหาสาเหตุ (Diagnostic) และใช้ข้อมูล Exit interview ประกอบ");
  }

  // 16. Account
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "บัญชี: ค่าใช้จ่ายจริงเทียบงบประมาณ");
    headline(s, "ค่าใช้จ่ายเกินงบ 2 หมวดหลัก: ค่าขนส่ง +18% และค่าซ่อมบำรุง +12%");
    chartCard(s);
    const cats = ["ค่าขนส่ง", "ค่าซ่อมบำรุง", "ค่าไฟฟ้า", "วัตถุดิบ", "ค่าแรง", "การตลาด"];
    const vals = [18, 12, 4, 2, -1, -6];
    s.addChart(pres.charts.BAR, [{ name: "% ต่างจากงบ", labels: cats, values: vals }],
      { ...chartBase(), x: 0.75, y: 2.0, w: 7.6, h: 4.7, barDir: "bar", catAxisOrientation: "maxMin", barGapWidthPct: 40,
        chartColors: [HEX.coral, HEX.coral, HEX.gray, HEX.gray, HEX.teal, HEX.teal], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "+0\"%\";-0\"%\"",
        valAxisLabelFormatCode: "+0\"%\";-0\"%\";0", valAxisMinVal: -10, valAxisMaxVal: 25, valAxisMajorUnit: 5, catAxisLabelPos: "low",
        showTitle: true, title: "% ค่าใช้จ่ายจริงสูง (+) / ต่ำ (−) กว่างบ  ม.ค.–ก.ย.", objectName: "chart-acc" });
    await deptPanel(s, {
      sources: ["ระบบบัญชี / ERP (GL)", "งบประมาณประจำปี", "ใบแจ้งหนี้ และใบสำคัญจ่าย"],
      kpis: ["Gross Margin % / Net Profit %", "Budget Variance % รายหมวด", "DSO: ระยะเวลาเก็บหนี้ (วัน)", "กระแสเงินสดคงเหลือ"],
      action: ["ทบทวนสัญญาขนส่ง / รวมเที่ยวส่ง", "วางแผน PM ลดงานซ่อมฉุกเฉิน"],
    });
    s.addNotes("กราฟแบบ Variance ช่วยให้ผู้บริหารเห็นเฉพาะหมวดที่ต้องสนใจ แทนตารางงบเทียบจริงหลายสิบบรรทัด สีแดง = เกินงบเกินเกณฑ์ (เช่น > 10%) สีเทา = อยู่ในเกณฑ์ สีเขียวอมฟ้า = ต่ำกว่างบ ควรแนบตารางรายละเอียดไว้ในภาคผนวก");
  }

  // 17. Purchasing
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "จัดซื้อ: ผลงานซัพพลายเออร์");
    headline(s, "ซัพพลายเออร์ C ซึ่งมียอดซื้อ 22% ส่งตรงเวลาเพียง 82% — ต่ำกว่าเป้า 95%");
    chartCard(s);
    s.addChart(pres.charts.DOUGHNUT, [{ name: "สัดส่วนยอดซื้อ", labels: ["A", "B", "C", "D", "E"], values: [35, 25, 22, 10, 8] }],
      { ...chartBase(), x: 0.75, y: 2.05, w: 3.0, h: 4.6, holeSize: 55, chartColors: [HEX.gray, HEX.gray, HEX.coral, HEX.gray, HEX.gray],
        showLegend: false, showLabel: true, showPercent: true, showValue: false, dataLabelColor: HEX.ink, dataLabelPosition: "outEnd",
        showTitle: true, title: "สัดส่วนยอดซื้อ", objectName: "chart-pur-donut" });
    s.addChart(pres.charts.BAR, [{ name: "OTD %", labels: ["A", "B", "C", "D", "E"], values: [97, 96, 82, 94, 89] }],
      { ...chartBase(), x: 3.85, y: 2.05, w: 4.5, h: 4.6, barDir: "col", barGapWidthPct: 45, chartColors: [HEX.teal, HEX.teal, HEX.coral, HEX.gray, HEX.amber],
        showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0\"%\"", valAxisMinVal: 50, valAxisMaxVal: 100, valAxisMajorUnit: 10, valAxisLabelFormatCode: "0\"%\"",
        showTitle: true, title: "ส่งตรงเวลา (OTD) เป้า 95%", objectName: "chart-pur-otd" });
    await deptPanel(s, {
      sources: ["ERP: PO, วันนัดส่ง, วันรับของ (GR)", "ผลตรวจรับวัตถุดิบ (IQC)", "ใบเสนอราคา / ราคาตลาด"],
      kpis: ["OTD % (ส่งตรงเวลา)", "% ของเสียจากซัพพลายเออร์", "Cost Saving (บาท)", "PO Cycle Time (วัน)"],
      action: ["ทำแผนแก้ไขร่วมกับ C ภายใน 30 วัน", "หาแหล่งสำรองสำหรับรายการหลัก"],
    });
    s.addNotes("การนำกราฟสัดส่วนยอดซื้อมาคู่กับ OTD ทำให้ผู้บริหารเห็นทั้ง 'ความสำคัญ' และ 'ผลงาน' ซัพพลายเออร์ที่ยอดซื้อสูงแต่ผลงานต่ำคือความเสี่ยงอันดับแรก ต่อยอดได้เป็น Supplier Scorecard ที่รวมราคา คุณภาพ และการส่งมอบ");
  }

  // 18. QA Pareto
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "QA: ข้อร้องเรียนจากลูกค้า (Pareto)");
    headline(s, "3 ปัญหาแรกคิดเป็น 81% ของข้อร้องเรียนทั้งหมด — แก้ 3 เรื่องนี้ก่อน");
    chartCard(s);
    const labels = ["บรรจุภัณฑ์เสียหาย", "ฉลากผิด", "สิ่งแปลกปลอม", "สี/กลิ่นผิดปกติ", "น้ำหนักขาด", "อื่นๆ"];
    const cnt = [42, 28, 17, 9, 7, 5];
    const tot = cnt.reduce((a, b) => a + b, 0);
    let run = 0;
    const cum = cnt.map((v) => Math.round(((run += v) / tot) * 1000) / 10);
    s.addChart([
      { type: pres.charts.BAR, data: [{ name: "จำนวนข้อร้องเรียน", labels, values: cnt }],
        options: { chartColors: [HEX.teal, HEX.teal, HEX.teal, HEX.gray, HEX.gray, HEX.gray], barGapWidthPct: 35, barDir: "col" } },
      { type: pres.charts.LINE, data: [{ name: "สะสม %", labels, values: cum }],
        options: { chartColors: [HEX.amber], lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 7, dataLabelPosition: "t", secondaryValAxis: true, secondaryCatAxis: true } },
    ], { ...chartBase(), x: 0.75, y: 2.0, w: 7.6, h: 4.7, showLegend: true, legendPos: "t", catAxisLabelFontSize: 11,
      showValue: true, dataLabelPosition: "outEnd",
      valAxes: [
        { showValAxisTitle: true, valAxisTitle: "จำนวน (ครั้ง)", valAxisMinVal: 0, valAxisMaxVal: 50, valAxisMajorUnit: 10, valAxisTitleFontSize: 11, valAxisTitleColor: HEX.slate, valAxisTitleFontFace: "+mn-lt", valAxisLabelColor: HEX.slate, valAxisLabelFontSize: 11, valAxisLabelFontFace: "+mn-lt", valGridLine: { color: HEX.grid, size: 0.75 } },
        { showValAxisTitle: true, valAxisTitle: "สะสม (%)", valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, valAxisTitleFontSize: 11, valAxisTitleColor: HEX.slate, valAxisTitleFontFace: "+mn-lt", valAxisLabelColor: HEX.slate, valAxisLabelFontSize: 11, valAxisLabelFontFace: "+mn-lt", valGridLine: { style: "none" } },
      ],
      catAxes: [{ catAxisTitle: "ประเภทปัญหา", catAxisLabelColor: HEX.slate, catAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 11 }, { catAxisHidden: true }],
      objectName: "chart-qa-pareto" });
    await deptPanel(s, {
      sources: ["ระบบรับเรื่องร้องเรียนลูกค้า", "บันทึก CAPA (แก้ไข/ป้องกัน)", "ผล Internal / Customer Audit"],
      kpis: ["ข้อร้องเรียน ต่อล้านชิ้น (PPM)", "% CAPA ปิดตรงเวลา", "คะแนน Audit", "ต้นทุนคุณภาพ (Cost of Poor Quality)"],
      action: ["ตั้งทีมแก้บรรจุภัณฑ์ + ฉลาก", "เป้า: ลดข้อร้องเรียน 50% ใน 6 เดือน"],
    });
    s.addNotes("Pareto (กฎ 80/20) เป็นกราฟสำคัญที่สุดของ QA: แท่งเรียงจากมากไปน้อย เส้นสะสมบอกว่าแก้กี่เรื่องจะครอบคลุมปัญหากี่เปอร์เซ็นต์ เมื่อแก้แล้วให้ทำ Pareto ซ้ำเพื่อแสดงผลก่อน–หลังให้ผู้บริหารเห็น");
  }

  // 19. QC control chart
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "QC: แผนภูมิควบคุม (Control Chart)");
    headline(s, "ล็อตที่ 14 น้ำหนักหลุดเกณฑ์ควบคุม — ตรวจเครื่องบรรจุก่อนเกิดของเสียจำนวนมาก");
    chartCard(s);
    const lots = Array.from({ length: 20 }, (_, i) => `${i + 1}`);
    const w = [500.4, 499.6, 500.9, 500.2, 499.1, 500.6, 501.0, 499.8, 500.3, 500.7, 501.3, 501.6, 501.9, 503.4, 500.8, 500.1, 499.7, 500.5, 500.0, 499.5];
    s.addChart(pres.charts.LINE, [
      { name: "น้ำหนักเฉลี่ยต่อล็อต (g)", labels: lots, values: w },
      { name: "UCL 502.5", labels: lots, values: Array(20).fill(502.5) },
      { name: "ค่ากลาง 500.0", labels: lots, values: Array(20).fill(500.0) },
      { name: "LCL 497.5", labels: lots, values: Array(20).fill(497.5) },
    ], { ...chartBase(), x: 0.75, y: 2.0, w: 7.6, h: 4.7, chartColors: [HEX.teal, HEX.coral, HEX.slate, HEX.coral], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 6,
      showLegend: true, legendPos: "t", valAxisMinVal: 496, valAxisMaxVal: 504, valAxisMajorUnit: 1, valAxisLabelFormatCode: "0",
      showCatAxisTitle: true, catAxisTitle: "ล็อตที่", catAxisTitleFontFace: "+mn-lt", catAxisTitleFontSize: 11, catAxisTitleColor: HEX.slate, objectName: "chart-qc" });
    await deptPanel(s, {
      sources: ["Check sheet ตรวจระหว่างผลิต", "เครื่องชั่ง / เครื่องมือวัด", "ผลตรวจก่อนส่ง (OQC)"],
      kpis: ["% ของเสีย (Defect rate)", "First Pass Yield (FPY)", "ความสามารถกระบวนการ Cpk", "จำนวนล็อตที่ถูก Hold"],
      action: ["ตั้งกฎหยุดเครื่องเมื่อจุดหลุด UCL/LCL", "สังเกตแนวโน้มขาขึ้น ล็อต 9–13"],
    });
    s.addNotes("Control chart แยก 'ความแปรปรวนปกติ' ออกจาก 'ความผิดปกติที่มีสาเหตุ' จุดที่หลุดเส้น UCL/LCL หรือแนวโน้มขึ้นต่อเนื่องหลายจุด (ล็อต 9–13) คือสัญญาณให้ตรวจสอบ ช่วยให้ QC ทำงานเชิงป้องกันแทนการคัดของเสียทีหลัง ค่าในกราฟเป็นข้อมูลตัวอย่าง");
  }

  // 20. R&D
  {
    const s = newSlide("CONTENT");
    await deptTitle(s, "R&D: ท่อโครงการพัฒนาสินค้าใหม่");
    headline(s, "จาก 40 ไอเดีย ออกสู่ตลาดได้ 3 รายการ — ขั้นพัฒนาสูตรใช้เวลานานที่สุด");
    chartCard(s);
    const stages = ["ไอเดีย", "คัดกรอง", "พัฒนาสูตร", "ทดลองผลิต", "ออกตลาด"];
    s.addChart(pres.charts.BAR, [{ name: "จำนวนโครงการ", labels: stages, values: [40, 18, 9, 5, 3] }],
      { ...chartBase(), x: 0.75, y: 2.05, w: 4.1, h: 4.6, barDir: "bar", catAxisOrientation: "maxMin", valAxisHidden: true, valGridLine: { style: "none" }, barGapWidthPct: 30,
        chartColors: [HEX.aqua, HEX.aqua, HEX.teal, HEX.teal, HEX.amber], showValue: true, dataLabelPosition: "outEnd",
        showTitle: true, title: "จำนวนโครงการแต่ละขั้น", objectName: "chart-rd-funnel" });
    s.addChart(pres.charts.BAR, [
      { name: "แผน (สัปดาห์)", labels: stages.slice(1), values: [2, 8, 4, 2] },
      { name: "จริง (สัปดาห์)", labels: stages.slice(1), values: [3, 14, 5, 2] },
    ], { ...chartBase(), x: 4.95, y: 2.05, w: 3.4, h: 4.6, barDir: "col", barGapWidthPct: 50, chartColors: [HEX.gray, HEX.teal], catAxisLabelFontSize: 10,
      showLegend: true, legendPos: "t", showValue: true, dataLabelPosition: "outEnd", valAxisHidden: true, valGridLine: { style: "none" },
      showTitle: true, title: "เวลาเฉลี่ย: แผน vs จริง", objectName: "chart-rd-time" });
    await deptPanel(s, {
      sources: ["Project tracker (Stage-Gate)", "ผลทดสอบในห้องแล็บ", "ยอดขายสินค้าใหม่จาก ERP"],
      kpis: ["Time-to-market (สัปดาห์)", "% โครงการตรงแผน", "% รายได้จากสินค้าใหม่", "งบ R&D ต่อรายได้"],
      action: ["เพิ่มทรัพยากรขั้นพัฒนาสูตร", "ทดสอบตลาดเร็วขึ้นตั้งแต่ขั้นคัดกรอง"],
    });
    s.addNotes("R&D มักวัดผลยากเพราะผลลัพธ์ใช้เวลานาน ให้ใช้กราฟกรวย (Pipeline) ดูอัตราการผ่านแต่ละขั้น คู่กับเวลาแผนเทียบจริงเพื่อหาคอขวด (ขั้นพัฒนาสูตรใช้ 14 สัปดาห์ จากแผน 8) ผู้บริหารจะเห็นว่าควรลงทรัพยากรที่ขั้นไหน");
  }

  }

  // 21. Summary matrix
  {
    const s = newSlide("CONTENT");
    s.addText("KPI กราฟ และแหล่งข้อมูลของแต่ละแผนก", { placeholder: "title" });
    const H = (t) => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.deep }, fontSize: 14 } });
    const D = (t) => ({ text: t, options: { bold: true, color: HEX.deep } });
    s.addTable([
      [H("แผนก"), H("KPI หลัก"), H("กราฟที่แนะนำ"), H("แหล่งข้อมูล")],
      [D("HR"), "Turnover %, Time-to-hire, ชม.อบรม", "เส้นแนวโน้ม + เส้นเป้า", "HRIS, Exit interview"],
      [D("บัญชี"), "Gross Margin, Budget Variance, DSO", "แท่งส่วนต่างจากงบ", "ระบบบัญชี / ERP"],
      [D("จัดซื้อ"), "OTD %, Cost Saving, % ของเสียซัพพลายเออร์", "โดนัทสัดส่วน + แท่ง OTD", "ERP (PO/GR), IQC"],
      [D("QA"), "ข้อร้องเรียน PPM, % CAPA ปิดตรงเวลา", "Pareto (แท่ง + เส้นสะสม)", "ระบบร้องเรียน, CAPA log"],
      [D("QC"), "% ของเสีย, FPY, Cpk", "Control chart", "Check sheet, เครื่องมือวัด"],
      [D("R&D"), "Time-to-market, % รายได้สินค้าใหม่", "กรวยโครงการ + แผน vs จริง", "Project tracker, ERP"],
    ], { x: 0.6, y: 1.45, w: 12.1, colW: [1.5, 4.2, 3.4, 3.0], fontSize: 14, color: HEX.ink, rowH: 0.72, valign: "middle",
      border: { type: "solid", pt: 0.75, color: HEX.grid }, fill: { color: HEX.white }, objectName: "table-summary" });
    s.addNotes("สไลด์นี้เป็นแผ่นสรุปให้ผู้ฟังถ่ายรูปเก็บไว้ ชี้ว่ากราฟแต่ละแบบเชื่อมกับหัวข้อ 'เลือกกราฟให้ตรงกับคำถาม' อย่างไร เช่น QA ใช้ Pareto เพราะคำถามคือ 'ปัญหาไหนสำคัญที่สุด' แนะนำให้แต่ละแผนกเริ่มจาก KPI 1–2 ตัวแรกก่อน และเตรียมข้อมูลจริงมาในคอร์สเจาะลึก");
  }

  // =============== Section 06 wrap ===============
  sectionTitle = "นำไปใช้จริง";
  pres.addSection({ title: sectionTitle });

  // 22. Do & Don't
  {
    const s = newSlide("CONTENT");
    s.addText("ข้อผิดพลาดที่พบบ่อย และวิธีแก้", { placeholder: "title" });
    const pairs = [
      ["ใส่ทุกตัวเลขลงในสไลด์", "เลือก 1 ข้อความหลักต่อ 1 สไลด์ รายละเอียดไว้ภาคผนวก"],
      ["หัวสไลด์เป็นแค่ชื่อหัวข้อ", "หัวสไลด์คือข้อสรุป เช่น \"ไลน์ C ของเสียสูงสุด\""],
      ["ใช้สีหลายสีโดยไม่มีความหมาย", "สีเทาเป็นพื้น สีเน้นเฉพาะจุดสำคัญ"],
      ["นำเสนอปัญหา แต่ไม่มีทางออก", "จบด้วยข้อเสนอ ต้นทุน และสิ่งที่ขอให้ตัดสินใจ"],
      ["ข้อมูลไม่ตรงกับฝ่ายอื่น", "ระบุแหล่งข้อมูล วันที่ตัดยอด และสูตรทุกครั้ง"],
    ];
    T(s, "สิ่งที่ควรเลี่ยง", { x: 1.3, y: 1.35, w: 5, h: 0.45, fontSize: 17, bold: true, color: C.accent3, valign: "middle" });
    T(s, "ควรทำแทน", { x: 7.5, y: 1.35, w: 5, h: 0.45, fontSize: 17, bold: true, color: C.accent1, valign: "middle" });
    for (let i = 0; i < pairs.length; i++) {
      const y = 1.95 + i * 0.97;
      card(s, 0.6, y, 5.9, 0.82, C.background2);
      card(s, 6.8, y, 5.9, 0.82, C.background2);
      await iconCircle(s, "FaCircleXmark", 0.75, y + 0.16, 0.5, C.accent3);
      await iconCircle(s, "FaCircleCheck", 6.95, y + 0.16, 0.5, C.accent1);
      T(s, pairs[i][0], { x: 1.4, y, w: 4.95, h: 0.82, fontSize: 14, valign: "middle" });
      T(s, pairs[i][1], { x: 7.6, y, w: 4.95, h: 0.82, fontSize: 14, valign: "middle" });
    }
    s.addNotes("ข้อ 5 สำคัญมากในการประชุมผู้บริหาร: ถ้าตัวเลขของสองแผนกไม่ตรงกัน การประชุมจะกลายเป็นการเถียงเรื่องตัวเลขแทนการตัดสินใจ ควรตกลงนิยามและแหล่งข้อมูลกลางร่วมกัน (Single Source of Truth)");
  }

  // 23. Tools ladder
  {
    const s = newSlide("CONTENT");
    s.addText("เครื่องมือ: เริ่มจากสิ่งที่มี แล้วค่อยต่อยอด", { placeholder: "title" });
    const tools = [
      ["Excel / Google Sheets", "ตารางแบบ Tidy, สูตร, Pivot Table, กราฟพื้นฐาน", "เริ่มได้ทันที", "FaFileExcel"],
      ["Power Query", "ดึงและทำความสะอาดข้อมูลอัตโนมัติ กดรีเฟรชครั้งเดียว", "ลดงานซ้ำ", "FaFilter"],
      ["Power BI / Looker Studio", "Dashboard เชื่อมข้อมูลหลายแหล่ง กรองได้ แชร์ออนไลน์", "Dashboard ผู้บริหาร", "FaChartPie"],
      ["SQL / Python", "ข้อมูลปริมาณมาก วิเคราะห์เชิงสถิติ และพยากรณ์", "ขั้นสูง", "FaRocket"],
    ];
    const bw = 2.9, gap = 0.17, base = 6.75;
    for (let i = 0; i < 4; i++) {
      const [t, d, tag, ic] = tools[i];
      const x = 0.6 + i * (bw + gap);
      const h = 3.0 + i * 0.6;
      const y = base - h;
      card(s, x, y, bw, h, i === 3 ? C.text2 : C.background2);
      await iconCircle(s, ic, x + 0.25, y + 0.25, 0.7, i === 3 ? C.accent2 : C.accent1, i === 3 ? HEX.deep : HEX.white);
      T(s, tag, { x: x + 1.1, y: y + 0.3, w: bw - 1.3, h: 0.6, fontSize: 13, bold: true, color: i === 3 ? C.accent2 : C.accent4, valign: "middle" });
      T(s, t, { x: x + 0.25, y: y + 1.1, w: bw - 0.5, h: 0.75, fontSize: 17, bold: true, color: i === 3 ? C.background1 : C.text2 });
      T(s, d, { x: x + 0.25, y: y + 1.85, w: bw - 0.5, h: 0.7, fontSize: 13, color: i === 3 ? C.accent5 : C.text1 });
    }
    T(s, "ทักษะสำคัญกว่าเครื่องมือ: ตั้งคำถามเป็น • ข้อมูลสะอาด • เล่าเรื่องได้", { x: 0.6, y: 1.3, w: 7.5, h: 0.5, fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
    s.addNotes("ไม่จำเป็นต้องเริ่มด้วย Power BI องค์กรส่วนใหญ่เริ่มจาก Excel ที่ออกแบบตารางถูกต้อง แล้วใช้ Power Query ลดงานซ้ำ เมื่อข้อมูลพร้อมจึงทำ Dashboard ส่วน SQL/Python ใช้เมื่อข้อมูลมีปริมาณมากหรือต้องพยากรณ์");
  }

  // 24. 30-60-90 plan
  {
    const s = newSlide("CONTENT");
    s.addText("แผนลงมือทำ 30 – 60 – 90 วัน", { placeholder: "title" });
    const phases = [
      ["30 วัน", "วางรากฐาน", ["เลือก 1 คำถามธุรกิจของแผนก", "กำหนด KPI 1–2 ตัว พร้อมสูตรและเป้า", "ออกแบบตาราง/ฟอร์มเก็บข้อมูลแบบ Tidy"]],
      ["60 วัน", "สร้างรายงาน", ["เก็บข้อมูลต่อเนื่อง ตรวจคุณภาพ 6 ด้าน", "ทำกราฟตามคำถาม หัวกราฟเป็นข้อสรุป", "ทดลองนำเสนอหัวหน้าแผนก"]],
      ["90 วัน", "นำเสนอผู้บริหาร", ["Dashboard 1 หน้า + ข้อเสนอ", "ขอการตัดสินใจที่ชัดเจน", "ติดตามผลและปรับปรุงรายเดือน"]],
    ];
    // timeline line
    s.addShape(pres.shapes.LINE, { x: 0.9, y: 2.05, w: 11.5, h: 0, line: { color: C.accent4, width: 2 }, objectName: nm("tl") });
    const cw = 3.9, gap = 0.2;
    phases.forEach(([d, t, items], i) => {
      const x = 0.6 + i * (cw + gap);
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.7, w: 0.7, h: 0.7, fill: { color: i === 2 ? C.accent2 : C.accent1 }, line: { color: C.background1, width: 3 }, objectName: nm("tl-dot") });
      T(s, `${i + 1}`, { x: x + 0.25, y: 1.7, w: 0.7, h: 0.7, fontSize: 18, bold: true, color: i === 2 ? C.text2 : C.background1, align: "center", valign: "middle" });
      card(s, x, 2.7, cw, 4.05, i === 2 ? C.text2 : C.background2);
      T(s, d, { x: x + 0.3, y: 2.9, w: cw - 0.6, h: 0.65, fontSize: 28, bold: true, color: i === 2 ? C.accent2 : C.accent1, valign: "middle" });
      T(s, t, { x: x + 0.3, y: 3.55, w: cw - 0.6, h: 0.5, fontSize: 18, bold: true, color: i === 2 ? C.background1 : C.text2, valign: "middle" });
      T(s, items.map((it, k) => ({ text: it, options: { bullet: { indent: 16 }, breakLine: k < items.length - 1, paraSpaceAfter: 8 } })),
        { x: x + 0.3, y: 4.25, w: cw - 0.6, h: 2.35, fontSize: 14, color: i === 2 ? C.background1 : C.text1 });
    });
    s.addNotes("ปิดด้วยการบ้าน: ให้แต่ละแผนกเลือก 1 คำถามและ 1 KPI วันนี้เลย แล้วนัดติดตามผลใน 30 วัน การเริ่มเล็กแต่ทำต่อเนื่องได้ผลดีกว่าทำ Dashboard ใหญ่ครั้งเดียวแล้วไม่มีใครอัปเดต");
  }

  // Course roadmap
  {
    const s = newSlide("CONTENT");
    s.addText("เส้นทางการเรียนรู้: คอร์สถัดไป", { placeholder: "title" });
    T(s, "วันนี้ปูพื้นภาพรวม คอร์สถัดไปเจาะลึกทีละแผนก โดยใช้ข้อมูลจริงของแต่ละแผนก", { x: 0.6, y: 1.2, w: 12.1, h: 0.45, fontSize: 16, color: C.accent4, valign: "middle" });
    // course 1 (today)
    card(s, 0.6, 1.9, 3.3, 4.85, C.text2);
    await iconCircle(s, "FaRoute", 0.85, 2.15, 0.85, C.accent2, HEX.deep);
    T(s, "คอร์ส 1 • วันนี้", { x: 0.85, y: 3.2, w: 2.85, h: 0.4, fontSize: 14, bold: true, color: C.accent2 });
    T(s, "ภาพรวม Data Analyst", { x: 0.85, y: 3.6, w: 2.85, h: 0.9, fontSize: 20, bold: true, color: C.background1 });
    T(s, ["ตั้งคำถาม & เก็บข้อมูล", "คุณภาพข้อมูล", "เลือกกราฟ & KPI", "นำเสนอผู้บริหาร"].map((t, k, a) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: k < a.length - 1, paraSpaceAfter: 4 } })),
      { x: 0.85, y: 4.6, w: 2.85, h: 2.0, fontSize: 14, color: C.accent5 });
    s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: 4.03, y: 4.15, w: 0.2, h: 0.4, rotate: 90, fill: { color: C.accent4 }, line: { type: "none" }, objectName: nm("chev") });
    const next = [
      ["HR", "Turnover, อัตรากำลัง, การอบรม", "FaUsers"],
      ["บัญชี", "งบเทียบจริง, กำไร, กระแสเงินสด", "FaCalculator"],
      ["จัดซื้อ", "Supplier scorecard, ต้นทุน", "FaCartShopping"],
      ["QA", "ข้อร้องเรียน, Pareto, CAPA", "FaShieldHalved"],
      ["QC", "% ของเสีย, Control chart, Cpk", "FaMagnifyingGlass"],
      ["R&D", "ท่อโครงการ, Time-to-market", "FaFlask"],
    ];
    const cw = 4.1, ch = 1.45, gx = 0.2, gy = 0.25, x0 = 4.4, y0 = 1.9;
    for (let i = 0; i < 6; i++) {
      const [n, d, ic] = next[i];
      const x = x0 + (i % 2) * (cw + gx), y = y0 + Math.floor(i / 2) * (ch + gy);
      card(s, x, y, cw, ch);
      await iconCircle(s, ic, x + 0.22, y + 0.3, 0.85);
      T(s, `คอร์ส ${i + 2}`, { x: x + 1.25, y: y + 0.18, w: cw - 1.45, h: 0.32, fontSize: 12, bold: true, color: C.accent4 });
      T(s, n, { x: x + 1.25, y: y + 0.48, w: cw - 1.45, h: 0.42, fontSize: 18, bold: true, color: C.text2, valign: "middle" });
      T(s, d, { x: x + 1.25, y: y + 0.92, w: cw - 1.45, h: 0.4, fontSize: 13, color: C.text1 });
    }
    s.addNotes("แจ้งแผนคอร์สต่อเนื่อง: แต่ละคอร์สเจาะลึกหนึ่งแผนก ทำ Workshop กับข้อมูลจริง ตั้งแต่ออกแบบตารางเก็บข้อมูล จนได้ Dashboard และสไลด์สำหรับผู้บริหาร การบ้านก่อนคอร์สถัดไป: แต่ละแผนกเลือก 1 คำถามธุรกิจ และรวบรวมข้อมูลตัวอย่าง 3–6 เดือน");
  }

  // 25. Closing
  {
    const s = newSlide("TITLE_DARK");
    T(s, "สรุปสั้นที่สุด", { x: 0.8, y: 1.2, w: 8, h: 0.4, fontSize: 16, bold: true, color: C.accent2 });
    s.addText("คำถามที่ดี + ข้อมูลที่เชื่อถือได้ + เรื่องเล่าที่ชัด = การตัดสินใจที่ดีขึ้น", { placeholder: "title" });
    s.addText("ถาม–ตอบ  |  ขอบคุณครับ/ค่ะ", { placeholder: "body" });
    s.addNotes("ทวนสามองค์ประกอบ แล้วเปิดช่วงถาม–ตอบ แนะนำให้ผู้ฟังถามด้วยตัวอย่างข้อมูลจริงจากแผนกของตัวเอง");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  // Thai text: point the theme's complex-script fonts at Tahoma (pptxgenjs leaves them blank / Cordia / Angsana)
  const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
  const p = "ppt/theme/theme1.xml";
  let x = await zip.file(p).async("string");
  x = x.replace(/<a:cs typeface=""\/>/g, '<a:cs typeface="Tahoma"/>').replace(/script="Thai" typeface="[^"]*"/g, 'script="Thai" typeface="Tahoma"');
  zip.file(p, x);
  fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });

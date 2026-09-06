import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const outputPath = path.join(root, "docs", "fonts", "provenance.json");
const fonts = [
  {
    asset: "Inter-Variable.woff2",
    family: "Inter",
    license: "OFL-1.1",
    licenseFile: "OFL-Inter.txt",
    source:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf",
    weights: "100–900",
  },
  {
    asset: "NotoSansArabic-Variable.woff2",
    family: "Noto Sans Arabic",
    license: "OFL-1.1",
    licenseFile: "OFL-Noto-Sans-Arabic.txt",
    source:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth,wght%5D.ttf",
    weights: "100–900",
  },
  {
    asset: "NotoNaskhArabic-Variable.woff2",
    family: "Noto Naskh Arabic",
    license: "OFL-1.1",
    licenseFile: "OFL-Noto-Naskh-Arabic.txt",
    source:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf",
    weights: "400–700",
  },
];

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

const assetRoot = path.join(root, "apps", "client", "public", "fonts");
const generatedFonts = await Promise.all(
  fonts.map(async (font) => ({
    ...font,
    sha256: await sha256(path.join(assetRoot, font.asset)),
  })),
);

const provenance = {
  generatedAt: "2026-09-05",
  generator: "scripts/font-provenance/generate.mjs",
  conversion:
    "Google Fonts upstream variable TTF converted to WOFF2 with fontTools 4.63.0 and Brotli",
  distribution: {
    client: "apps/client/public/fonts",
    dashboard: "apps/dashboard/public/fonts",
    instance: "instance-template/instance/assets/fonts",
  },
  renderEnvironment: {
    os: "ubuntu-24.04",
    architecture: "x86_64",
    playwright: "1.63.0",
    chromium: "Playwright-managed Chromium (installed with --with-deps)",
  },
  fonts: generatedFonts,
  policy: {
    runtimeSource: "self",
    remoteFontRequests: false,
    fallback:
      "Use the first shipped family in a semantic token; generic CSS families are allowed only as the final fallback.",
    visualReferences: {
      linux:
        "Canonical ubuntu-24.04 CI output; review actual and diff artifacts before promotion.",
      darwin: "Developer reference only; never promoted as the Linux baseline.",
    },
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(provenance, null, 2)}\n`);
process.stdout.write(`Wrote ${path.relative(root, outputPath)}\n`);

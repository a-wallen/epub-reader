import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates a valid EPUB 3 sample archive using off-the-shelf `JSZip`.
 */
export async function generateSampleEpub(
  outputPath: string = path.join(__dirname, "sample.epub")
): Promise<string> {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:12345678-1234-1234-1234-1234567890ab</dc:identifier>
    <dc:title>Small Studio Mixing Reference Guide</dc:title>
    <dc:creator>Studio Engineering Handbook</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch01_monitoring.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch02_eq_balance.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch03_mastering.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>`
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="ch01_monitoring.xhtml">Chapter 1: Small-Room Monitoring &amp; Standing Waves</a></li>
      <li><a href="ch02_eq_balance.xhtml">Chapter 2: Midrange Balance &amp; Surgical Dynamic EQ</a></li>
      <li><a href="ch03_mastering.xhtml">Chapter 3: Loudness Matching, Crest Factor &amp; True-Peak Limiting</a></li>
    </ol>
  </nav>
</body>
</html>`
  );
  zip.file(
    "OEBPS/ch01_monitoring.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
  <h1>Chapter 1: Small-Room Monitoring &amp; Standing Waves</h1>
  <p>Untreated small studio rooms exhibit severe modal standing waves between 20 Hz and 300 Hz, creating peaks and nulls of plus or minus 15 dB.</p>
  <p>Checking your mix in mono on a single midrange speaker isolates the critical 80 Hz to 4 kHz vocal and snare balance zone without crossover phase smear.</p>
</body>
</html>`
  );
  zip.file(
    "OEBPS/ch02_eq_balance.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 2</title></head>
<body>
  <h1>Chapter 2: Midrange Balance &amp; Surgical Dynamic EQ</h1>
  <p>High-pass the side channel below 95 Hz with an 18 dB per octave slope to lock sub-bass energy strictly in mono.</p>
  <p>Use an external sidechain dynamic EQ cut of 2 to 3 dB between 1.8 kHz and 3.2 kHz on the instrumental bus triggered by the lead vocal to carve a vocal pocket.</p>
</body>
</html>`
  );
  zip.file(
    "OEBPS/ch03_mastering.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 3</title></head>
<body>
  <h1>Chapter 3: Loudness Matching, Crest Factor &amp; True-Peak Limiting</h1>
  <p>Always level-match reference tracks to minus 16 LUFS before A/B comparison so Fletcher-Munson loudness bias does not deceive your ears.</p>
  <p>Set your final True-Peak limiter ceiling to minus 1.0 dBTP and verify phase correlation remains above plus 0.5 across all frequency bands.</p>
</body>
</html>`
  );

  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, zipBuf);
  return outputPath;
}


import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TextDecoder } from 'util';

async function extractTextFromPDF(path) {
    const dataBuffer = fs.readFileSync(path);
    const data = new Uint8Array(dataBuffer);

    // Configure PDFJS
    // We might need to mock a few things for node env if not fully supported, but recent pdfjs works okayish

    const loadingTask = pdfjsLib.getDocument({
        data: data,
        useSystemFonts: true,
        disableFontFace: true
    });

    try {
        const pdf = await loadingTask.promise;
        console.log(`PDF loaded. Pages: ${pdf.numPages}`);

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            fullText += strings.join(' ') + '\n';
        }

        console.log("--- START PDF CONTENT ---");
        // console.log(fullText);
        fs.writeFileSync('ne_content.txt', fullText);
        console.log("--- EXTRACTED TEXT SAVED TO ne_content.txt ---");

    } catch (error) {
        console.error("Error parsing PDF:", error);
    }
}

extractTextFromPDF('c:\\Users\\T-GAMER\\Documents\\gestao-clc\\exemplo_NE.pdf');

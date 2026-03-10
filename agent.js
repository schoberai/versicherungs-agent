import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import readline from "readline";
import path from "path";

const client = new Anthropic();
const DB_FILE = "versicherungen.json";

function loadInsurances() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveInsurances(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  console.log("✅ VERSICHERUNG GESPEICHERT!\n");
}

async function analyzePDFWithClaude(pdfPath) {
  // Lese die PDF-Datei als Base64
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");
  
  console.log("⏳ Claude analysiert die PDF...\n");
  
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf
            }
          },
          {
            type: "text",
            text: `Analysiere diese Versicherungs-Police und extrahiere FOLGENDE Informationen:

1. Name der Versicherung (z.B. "AXA Berufshaftpflicht")
2. Typ (Haftpflicht, Krankenversicherung, Berufsunfähigkeit, Rechtsschutz, etc.)
3. Monatliche Kosten/Beitrag in Euro (nur die Zahl, z.B. 50)
4. Ablaufdatum oder Gültig bis (Format: YYYY-MM-DD, z.B. 2025-12-31)
5. Versicherer/Anbieter (z.B. "AXA", "TK", "Allianz")

Antworte GENAU in diesem Format (keine anderen Worte):
NAME: [Versicherungsname]
TYP: [Typ]
KOSTEN: [Betrag]
ABLAUF: [Datum]
ANBIETER: [Versicherer]`
          }
        ]
      }
    ]
  });

  return response.content[0].text;
}

function parseAgentResponse(text) {
  const lines = text.split("\n");
  const data = {};
  
  lines.forEach(line => {
    if (line.startsWith("NAME:")) data.name = line.replace("NAME:", "").trim();
    if (line.startsWith("TYP:")) data.type = line.replace("TYP:", "").trim();
    if (line.startsWith("KOSTEN:")) data.monthly_cost = parseFloat(line.replace("KOSTEN:", "").trim());
    if (line.startsWith("ABLAUF:")) data.expiry_date = line.replace("ABLAUF:", "").trim();
    if (line.startsWith("ANBIETER:")) data.provider = line.replace("ANBIETER:", "").trim();
  });
  
  return data;
}

async function processPDF(pdfPath, rl) {
  if (!fs.existsSync(pdfPath)) {
    console.log("❌ Datei nicht gefunden: " + pdfPath + "\n");
    return;
  }
  
  try {
    const analysisResult = await analyzePDFWithClaude(pdfPath);
    console.log("📋 EXTRAHIERTE DATEN:\n");
    console.log(analysisResult);
    console.log("\n");
    
    const insuranceData = parseAgentResponse(analysisResult);
    
    // Frage ob speichern
    rl.question("Sollen diese Daten gespeichert werden? (ja/nein): ", (answer) => {
      if (answer.toLowerCase() === "ja") {
        const allData = loadInsurances();
        allData.push({
          id: allData.length + 1,
          created_at: new Date().toISOString(),
          ...insuranceData
        });
        saveInsurances(allData);
      } else {
        console.log("Nicht gespeichert.\n");
      }
      mainMenu();
    });
  } catch (error) {
    console.log("❌ Fehler:", error.message + "\n");
    mainMenu();
  }
}

async function listInsurances() {
  const data = loadInsurances();
  if (data.length === 0) {
    console.log("📭 Keine Versicherungen gespeichert.\n");
    return;
  }
  
  console.log("\n📋 DEINE VERSICHERUNGEN:\n");
  data.forEach((ins, i) => {
    console.log(`${i+1}. ${ins.name} (${ins.type})`);
    console.log(`   Kosten: ${ins.monthly_cost}€/Monat`);
    console.log(`   Ablauf: ${ins.expiry_date}`);
    console.log(`   Anbieter: ${ins.provider}\n`);
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("🛡️ VERSICHERUNGS-AGENT - PDF ANALYZER\n");
console.log("Befehle:");
console.log("  'pdf'    - PDF-Police analysieren");
console.log("  'list'   - Alle Versicherungen anzeigen");
console.log("  'exit'   - Beenden\n");

function mainMenu() {
  rl.question("Befehl: ", async (cmd) => {
    if (cmd === "exit") {
      console.log("👋 Auf Wiedersehen!");
      rl.close();
      return;
    }
    
    if (cmd === "pdf") {
      rl.question("📄 Pfad zur PDF (z.B. meine-police.pdf): ", (pdfPath) => {
        processPDF(pdfPath, rl);
      });
      return;
    } else if (cmd === "list") {
      await listInsurances();
    }
    
    mainMenu();
  });
}

mainMenu();
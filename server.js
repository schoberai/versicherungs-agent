import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;
const DB_FILE = "versicherungen.json";

app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic();

function loadInsurances() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveInsurances(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function analyzePDFWithClaude(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");
  
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

1. Name der Versicherung
2. Typ (Haftpflicht, Krankenversicherung, KFZ, etc.)
3. Monatliche Kosten/Beitrag in Euro
4. Ablaufdatum (Format: YYYY-MM-DD)
5. Versicherer/Anbieter

Antworte GENAU in diesem Format:
NAME: [Name]
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

// GET all insurances
app.get("/api/insurances", (req, res) => {
  const data = loadInsurances();
  res.json(data);
});

// POST analyze PDF
app.post("/api/analyze-pdf", async (req, res) => {
  try {
    const { filename } = req.body;
    const analysisResult = await analyzePDFWithClaude(filename);
    const insuranceData = parseAgentResponse(analysisResult);
    
    res.json({
      success: true,
      data: insuranceData,
      rawAnalysis: analysisResult
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST save insurance
app.post("/api/save-insurance", (req, res) => {
  try {
    const allData = loadInsurances();
    const newInsurance = {
      id: allData.length + 1,
      created_at: new Date().toISOString(),
      ...req.body
    };
    allData.push(newInsurance);
    saveInsurances(allData);
    
    res.json({
      success: true,
      message: "Versicherung gespeichert!",
      data: newInsurance
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST delete insurance
app.post("/api/delete-insurance", (req, res) => {
  try {
    const { id } = req.body;
    const allData = loadInsurances();
    const filtered = allData.filter(ins => ins.id !== id);
    saveInsurances(filtered);
    
    res.json({
      success: true,
      message: "Versicherung gelöscht!"
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST ask agent
app.post("/api/ask-agent", async (req, res) => {
  try {
    const { question } = req.body;
    const insurances = loadInsurances();
    
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Du bist ein hilfreicher Versicherungs-Manager. Hier sind die aktuellen Versicherungen:

${JSON.stringify(insurances, null, 2)}

Der Nutzer fragt: "${question}"

Antworte hilfreich, freundlich und auf Deutsch!`
        }
      ]
    });

    res.json({
      success: true,
      answer: response.content[0].text
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 WEB-SERVER LÄUFT!`);
  console.log(`\n📱 Öffne deinen Browser: http://localhost:3000\n`);
});
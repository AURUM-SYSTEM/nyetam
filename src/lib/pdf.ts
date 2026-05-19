import jsPDF from "jspdf";

export type DocForPdf = {
  type: "rapport" | "pv";
  title: string;
  introduction: string;
  faits: string;
  declarations: string;
  conclusion: string;
  created_at?: string;
};

export function exportDocumentPdf(doc: DocForPdf) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Header band
  pdf.setFillColor(20, 20, 20);
  pdf.rect(0, 0, pageWidth, 80, "F");
  pdf.setTextColor(201, 168, 76);
  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  pdf.text("AURUM SYSTEM", margin, 38);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(220, 220, 220);
  pdf.text(doc.type === "rapport" ? "RAPPORT" : "PROCÈS-VERBAL", margin, 58);
  const dateStr = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("fr-FR");
  pdf.text(dateStr, pageWidth - margin - pdf.getTextWidth(dateStr), 58);

  y = 110;

  // Title
  pdf.setTextColor(20, 20, 20);
  pdf.setFont("times", "bold");
  pdf.setFontSize(18);
  const titleLines = pdf.splitTextToSize(doc.title || "Document", contentWidth);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 22 + 10;

  pdf.setDrawColor(201, 168, 76);
  pdf.setLineWidth(1);
  pdf.line(margin, y, margin + 60, y);
  y += 24;

  const sections: Array<{ heading: string; body: string }> = [
    { heading: "Introduction", body: doc.introduction },
    { heading: "Faits", body: doc.faits },
    { heading: "Déclarations", body: doc.declarations },
    { heading: "Conclusion", body: doc.conclusion },
  ];

  for (const s of sections) {
    ensureSpace(40);
    pdf.setFont("times", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(120, 95, 30);
    pdf.text(s.heading.toUpperCase(), margin, y);
    y += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    const lines = pdf.splitTextToSize(s.body || "—", contentWidth);
    for (const line of lines) {
      ensureSpace(16);
      pdf.text(line, margin, y);
      y += 15;
    }
    y += 14;
  }

  // Footer on every page
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    pdf.text("Généré par AURUM SYSTEM", margin, pageHeight - 20);
  }

  const safe = (doc.title || "aurum-document").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60);
  pdf.save(`${safe || "document"}.pdf`);
}
